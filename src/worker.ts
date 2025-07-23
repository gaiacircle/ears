import {
	// VAD
	AutoModel,
	// LLM
	AutoTokenizer,
	AutoModelForCausalLM,
	TextStreamer,
	InterruptableStoppingCriteria,
	// Speech recognition
	Tensor,
	pipeline,
	PretrainedConfig,
	StoppingCriteriaList,
	type Message,
} from "@huggingface/transformers";

// @ts-ignore - Module resolution issue with kokoro-js
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

import {
	MAX_BUFFER_DURATION,
	INPUT_SAMPLE_RATE,
	SPEECH_THRESHOLD,
	EXIT_THRESHOLD,
	SPEECH_PAD_SAMPLES,
	MAX_NUM_PREV_BUFFERS,
	MIN_SILENCE_DURATION_SAMPLES,
	MIN_SPEECH_DURATION_SAMPLES,
} from "./constants";

// biome-ignore lint/suspicious/noExplicitAny: transformers.js doesn't provide type for past_key_values values
type PastKeyValues = Record<string, any>;

type GenerationObjectOutput = {
	past_key_values: PastKeyValues;
	sequences: Tensor;
};

function getGPU(navigator: Navigator) {
	if (!("gpu" in navigator)) return null;

	return navigator.gpu as {
		requestAdapter: () => Promise<{ requestDevice: () => Promise<string> }>;
	};
}

// Detect available device with fallback
async function detectDevice(): Promise<"webgpu" | "wasm"> {
	// Check if WebGPU is supported and functional
	const gpu = getGPU(navigator);
	if (gpu) {
		try {
			const adapter = await gpu.requestAdapter();
			if (adapter) {
				const device = await adapter.requestDevice();
				if (device) {
					return "webgpu";
				}
			}
		} catch (error) {
			console.warn("WebGPU detection failed, falling back to WASM:", error);
		}
	}
	// Fallback to WASM
	return "wasm";
}

(async (): Promise<void> => {
	const device = await detectDevice();
	self.postMessage({ type: "info", message: `Using device: "${device}"` });

	const model_id = "onnx-community/Kokoro-82M-v1.0-ONNX";
	type VoiceKey = keyof typeof tts.voices;
	let voice: VoiceKey | undefined;
	const tts = await KokoroTTS.from_pretrained(model_id, {
		dtype: "fp32",
		device,
	});
	self.postMessage({
		type: "info",
		message: "Loading models...",
		duration: "until_next",
	});

	// Load models
	const silero_vad = await AutoModel.from_pretrained(
		"onnx-community/silero-vad",
		{
			config: new PretrainedConfig({ model_type: "custom" }),
			dtype: "fp32", // Full-precision
		},
	).catch((error) => {
		self.postMessage({ error });
		throw error;
	});

	type DtypeConfig =
		| "auto"
		| "fp32"
		| "fp16"
		| "q8"
		| "int8"
		| "uint8"
		| "q4"
		| "bnb4"
		| "q4f16";

	const DEVICE_DTYPE_CONFIGS: Record<
		string,
		{ encoder_model: DtypeConfig; decoder_model_merged: DtypeConfig }
	> = {
		webgpu: {
			encoder_model: "fp32",
			decoder_model_merged: "fp32",
		},
		wasm: {
			encoder_model: "fp32",
			decoder_model_merged: "q8",
		},
	};
	const transcriber = await pipeline(
		"automatic-speech-recognition",
		"onnx-community/whisper-base", // or "onnx-community/moonshine-base-ONNX",
		{
			device,
			dtype: DEVICE_DTYPE_CONFIGS[device as keyof typeof DEVICE_DTYPE_CONFIGS],
		},
	).catch((error) => {
		self.postMessage({ error });
		throw error;
	});

	await transcriber(new Float32Array(INPUT_SAMPLE_RATE)); // Compile shaders

	const llm_model_id = "HuggingFaceTB/SmolLM2-1.7B-Instruct";
	const tokenizer = await AutoTokenizer.from_pretrained(llm_model_id);
	const llm = await AutoModelForCausalLM.from_pretrained(llm_model_id, {
		dtype: "q4f16",
		device,
	});

	const SYSTEM_MESSAGE = {
		role: "system",
		content:
			"You're a helpful and conversational voice assistant. Keep your responses short, clear, and casual.",
	};
	await llm.generate({ ...tokenizer("x"), max_new_tokens: 1 }); // Compile shaders

	let messages: Message[] = [SYSTEM_MESSAGE];
	let past_key_values_cache: PastKeyValues | null = null;
	let stopping_criteria: InterruptableStoppingCriteria | undefined;
	self.postMessage({
		type: "status",
		status: "ready",
		message: "Ready!",
		voices: tts.voices,
	});

	// Global audio buffer to store incoming audio
	const BUFFER: Float32Array = new Float32Array(
		MAX_BUFFER_DURATION * INPUT_SAMPLE_RATE,
	);
	let bufferPointer = 0;

	// Initial state for VAD
	const sr: Tensor = new Tensor("int64", [INPUT_SAMPLE_RATE], []);
	let state: Tensor = new Tensor(
		"float32",
		new Float32Array(2 * 1 * 128),
		[2, 1, 128],
	);

	// Whether we are in the process of adding audio to the buffer
	let isRecording = false;
	let isPlaying = false; // new flag

	/**
	 * Perform Voice Activity Detection (VAD)
	 * @param {Float32Array} buffer The new audio buffer
	 * @returns {Promise<boolean>} `true` if the buffer is speech, `false` otherwise.
	 */
	async function vad(buffer: Float32Array): Promise<boolean> {
		const input = new Tensor("float32", buffer, [1, buffer.length]);

		const { stateN, output } = await silero_vad({ input, sr, state });
		state = stateN; // Update state

		const isSpeech: number = output.data[0] as number;

		// Use heuristics to determine if the buffer is speech or not
		return (
			// Case 1: We are above the threshold (definitely speech)
			isSpeech > SPEECH_THRESHOLD ||
			// Case 2: We are in the process of recording, and the probability is above the negative (exit) threshold
			(isRecording && isSpeech >= EXIT_THRESHOLD)
		);
	}

	type GenerationFunctionParameters = Parameters<typeof llm.generate>[0];
	type GenerationFunctionKeywordArgs = {
		input_ids: Tensor;
		attention_mask: number[] | number[][] | Tensor;
		token_type_ids?: number[] | number[][] | Tensor;
		past_key_values: null | object;
		do_sample: boolean;
		max_new_tokens: number;
		return_dict_in_generate: boolean;
	};

	const customGenerate = async (
		params: GenerationFunctionParameters & GenerationFunctionKeywordArgs,
	) => (await llm.generate(params)) as GenerationObjectOutput;

	const getTokenizerInputs = (messages: Message[]) => {
		const inputs = tokenizer.apply_chat_template(messages, {
			add_generation_prompt: true,
			return_dict: true,
		});

		if (!(typeof inputs === "object"))
			throw new Error("Tokenizer inputs are not an object");
		if (!("input_ids" in inputs)) throw new Error("input_ids not in inputs");

		const { input_ids, attention_mask } = inputs;

		if (!(input_ids instanceof Tensor))
			throw new Error("input_ids not a tensor");
		if (!(attention_mask instanceof Tensor))
			throw new Error("attention_mask not a tensor");

		return {
			input_ids,
			attention_mask,
		};
	};

	/**
	 * Transcribe the audio buffer
	 * @param {Float32Array} buffer The audio buffer
	 * @param {Object} data Additional data
	 */
	const speechToSpeech = async (
		buffer: Float32Array,
		data: { start: number; end: number; duration: number },
	): Promise<void> => {
		isPlaying = true;

		console.log("speechToSpeech");
		// 1. Transcribe the audio from the user
		const result = await transcriber(buffer);
		console.log({ result });
		const text: string = Array.isArray(result)
			? result[0]?.text?.trim() || ""
			: result?.text?.trim() || "";
		if (["", "[BLANK_AUDIO]"].includes(text)) {
			// If the transcription is empty or a blank audio, we skip the rest of the processing
			console.log("skip blank audio");
			return;
		}
		messages.push({ role: "user", content: text });

		self.postMessage({ type: "input", text });

		// Set up text-to-speech streaming
		const splitter = new TextSplitterStream();
		const stream = tts.stream(splitter, {
			voice: voice as VoiceKey,
		});
		(async () => {
			for await (const { text, phonemes, audio } of stream) {
				self.postMessage({ type: "output", text, result: audio });
			}
		})();

		// 2. Generate a response using the LLM
		const { input_ids, attention_mask } = getTokenizerInputs(messages);

		const streamer = new TextStreamer(tokenizer, {
			skip_prompt: true,
			skip_special_tokens: true,
			callback_function: (text) => {
				splitter.push(text);
			},
			token_callback_function: () => {},
		});

		stopping_criteria = new InterruptableStoppingCriteria();
		const stopping_criteria_list = new StoppingCriteriaList();
		stopping_criteria_list.push(stopping_criteria);

		const { past_key_values, sequences } = await customGenerate({
			input_ids,
			attention_mask,
			streamer,

			past_key_values: past_key_values_cache,
			do_sample: false, // TODO: do_sample: true is bugged (invalid data location on topk sample)
			stopping_criteria: stopping_criteria_list,
			max_new_tokens: 1024,
			// Causes return value to be an object with past_key_values and sequences
			return_dict_in_generate: true,
		});

		past_key_values_cache = past_key_values;

		// Finally, close the stream to signal that no more text will be added.
		splitter.close();

		const decoded = tokenizer.batch_decode(
			sequences.slice(null, [
				input_ids.dims[1],
				null /* ugh, the transformer.js types are wrong: null means 'take the whole dimension' */ as unknown as number,
			]),
			{ skip_special_tokens: true },
		);

		messages.push({ role: "assistant", content: decoded[0] });
	};

	// Track the number of samples after the last speech chunk
	let postSpeechSamples = 0;
	const resetAfterRecording = (offset = 0): void => {
		self.postMessage({
			type: "status",
			status: "recording_end",
			message: "Transcribing...",
			duration: "until_next",
		});
		BUFFER.fill(0, offset);
		bufferPointer = offset;
		isRecording = false;
		postSpeechSamples = 0;
	};

	const dispatchForTranscriptionAndResetAudioBuffer = (
		overflow?: Float32Array,
	): void => {
		// Get start and end time of the speech segment, minus the padding
		const now: number = Date.now();
		const end: number =
			now -
			((postSpeechSamples + SPEECH_PAD_SAMPLES) / INPUT_SAMPLE_RATE) * 1000;
		const start: number = end - (bufferPointer / INPUT_SAMPLE_RATE) * 1000;
		const duration: number = end - start;
		const overflowLength: number = overflow?.length ?? 0;

		// Send the audio buffer to the worker
		const buffer: Float32Array = BUFFER.slice(
			0,
			bufferPointer + SPEECH_PAD_SAMPLES,
		);

		const prevLength: number = prevBuffers.reduce(
			(acc, b) => acc + b.length,
			0,
		);
		const paddedBuffer: Float32Array = new Float32Array(
			prevLength + buffer.length,
		);
		let offset = 0;
		for (const prev of prevBuffers) {
			paddedBuffer.set(prev, offset);
			offset += prev.length;
		}
		paddedBuffer.set(buffer, offset);
		speechToSpeech(paddedBuffer, { start, end, duration });

		// Set overflow (if present) and reset the rest of the audio buffer
		if (overflow) {
			BUFFER.set(overflow, 0);
		}
		resetAfterRecording(overflowLength);
	};

	const prevBuffers: Float32Array[] = [];
	self.onmessage = async (event: MessageEvent): Promise<void> => {
		const { type, buffer } = event.data;

		// refuse new audio while playing back
		if (type === "audio" && isPlaying) return;

		switch (type) {
			case "start_call": {
				// const voiceKey = (voice ?? "af_heart") as VoiceKey;
				// const name: string = tts.voices[voiceKey]?.name ?? "Heart";
				// say(`Hey there, my name is ${name}! How can I help you today?`);
				return;
			}
			case "end_call":
				messages = [SYSTEM_MESSAGE];
				past_key_values_cache = null;
				stopping_criteria?.interrupt();
				return;
			case "interrupt":
				stopping_criteria?.interrupt();
				return;
			case "set_voice":
				voice = event.data.voice as VoiceKey;
				return;
			case "playback_ended":
				isPlaying = false;
				return;
		}

		const wasRecording: boolean = isRecording; // Save current state
		const isSpeech: boolean = await vad(buffer);

		if (!wasRecording && !isSpeech) {
			// We are not recording, and the buffer is not speech,
			// so we will probably discard the buffer. So, we insert
			// into a FIFO queue with maximum size of PREV_BUFFER_SIZE
			if (prevBuffers.length >= MAX_NUM_PREV_BUFFERS) {
				// If the queue is full, we discard the oldest buffer
				prevBuffers.shift();
			}
			prevBuffers.push(buffer);
			return;
		}

		const remaining: number = BUFFER.length - bufferPointer;
		if (buffer.length >= remaining) {
			// The buffer is larger than (or equal to) the remaining space in the global buffer,
			// so we perform transcription and copy the overflow to the global buffer
			BUFFER.set(buffer.subarray(0, remaining), bufferPointer);
			bufferPointer += remaining;

			// Dispatch the audio buffer
			const overflow: Float32Array = buffer.subarray(remaining);
			dispatchForTranscriptionAndResetAudioBuffer(overflow);
			return;
		}

		// The buffer is smaller than the remaining space in the global buffer,
		// so we copy it to the global buffer
		BUFFER.set(buffer, bufferPointer);
		bufferPointer += buffer.length;

		if (isSpeech) {
			if (!isRecording) {
				// Indicate start of recording
				self.postMessage({
					type: "status",
					status: "recording_start",
					message: "Listening...",
					duration: "until_next",
				});
			}
			// Start or continue recording
			isRecording = true;
			postSpeechSamples = 0; // Reset the post-speech samples
			return;
		}

		postSpeechSamples += buffer.length;

		// At this point we're confident that we were recording (wasRecording === true), but the latest buffer is not speech.
		// So, we check whether we have reached the end of the current audio chunk.
		if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
			// There was a short pause, but not long enough to consider the end of a speech chunk
			// (e.g., the speaker took a breath), so we continue recording
			return;
		}

		if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
			// The entire buffer (including the new chunk) is smaller than the minimum
			// duration of a speech chunk, so we can safely discard the buffer.
			resetAfterRecording();
			return;
		}

		dispatchForTranscriptionAndResetAudioBuffer();
	};

	function say(text: string): void {
		isPlaying = true;
		const splitter = new TextSplitterStream();
		const stream = tts.stream(splitter, { voice: voice as VoiceKey });
		(async () => {
			for await (const { text: chunkText, audio } of stream) {
				self.postMessage({ type: "output", text: chunkText, result: audio });
			}
		})();
		splitter.push(text);
		splitter.close();
		messages.push({ role: "assistant", content: text });
	}
})();
