import {
	// VAD
	AutoModel,
	AutoModelForCausalLM,
	// LLM
	AutoTokenizer,
	InterruptableStoppingCriteria,
	pipeline,
	PretrainedConfig,
	StoppingCriteriaList,
	// Speech recognition
	Tensor,
	TextStreamer,
	type Message,
	env as trEnv,
	PreTrainedModel,
	AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers"

// @ts-ignore - Module resolution issue with kokoro
import { KokoroTTS, TextSplitterStream } from "kokoro"

import {
	EXIT_THRESHOLD,
	INPUT_SAMPLE_RATE,
	MAX_BUFFER_DURATION,
	MAX_NUM_PREV_BUFFERS,
	MIN_SILENCE_DURATION_SAMPLES,
	MIN_SPEECH_DURATION_SAMPLES,
	SPEECH_PAD_SAMPLES,
	SPEECH_THRESHOLD,
} from "./constants"

import { detectDevice, DEVICE_DTYPE_CONFIGS } from "./lib/detect"

;(async (): Promise<void> => {
	const prevBuffers: Float32Array[] = []

	const device = await detectDevice()

	self.postMessage({
		type: "info",
		message: "Loading models...",
		duration: "until_next",
	})

	// Load models
	let voiceActivity: PreTrainedModel
	try {
		voiceActivity = await AutoModel.from_pretrained(
			"onnx-community/silero-vad",
			{
				config: new PretrainedConfig({ model_type: "custom" }),
				dtype: "fp32", // Full-precision
			},
		)
	} catch (error) {
		self.postMessage({ error })
		throw error
	}

	let transcriber: AutomaticSpeechRecognitionPipeline
	try {
		transcriber = (await pipeline(
			"automatic-speech-recognition",
			"onnx-community/whisper-base",
			{
				device,
				dtype:
					DEVICE_DTYPE_CONFIGS[device as keyof typeof DEVICE_DTYPE_CONFIGS],
			},
		)) as any
	} catch (error) {
		self.postMessage({ error })
		throw error
	}

	await transcriber(new Float32Array(INPUT_SAMPLE_RATE)) // Compile shaders

	self.postMessage({
		type: "status",
		status: "ready",
		message: "Ready!",
		voices: {},
	})

	// Global audio buffer to store incoming audio
	const BUFFER: Float32Array = new Float32Array(
		MAX_BUFFER_DURATION * INPUT_SAMPLE_RATE,
	)
	let bufferPointer = 0

	// Initial state for VAD
	const sr: Tensor = new Tensor("int64", [INPUT_SAMPLE_RATE], [])
	let state: Tensor = new Tensor(
		"float32",
		new Float32Array(2 * 1 * 128),
		[2, 1, 128],
	)

	// Whether we are in the process of adding audio to the buffer
	let isRecording = false

	/**
	 * Perform Voice Activity Detection (VAD)
	 * @param {Float32Array} buffer The new audio buffer
	 * @returns {Promise<boolean>} `true` if the buffer is speech, `false` otherwise.
	 */
	async function vad(buffer: Float32Array): Promise<boolean> {
		const input = new Tensor("float32", buffer, [1, buffer.length])

		const { stateN, output } = await voiceActivity({ input, sr, state })
		state = stateN // Update state

		const isSpeech: number = output.data[0] as number

		// Use heuristics to determine if the buffer is speech or not
		return (
			// Case 1: We are above the threshold (definitely speech)
			isSpeech > SPEECH_THRESHOLD ||
			// Case 2: We are in the process of recording, and the probability is above the negative (exit) threshold
			(isRecording && isSpeech >= EXIT_THRESHOLD)
		)
	}

	/**
	 * Transcribe the audio buffer
	 * @param {Float32Array} buffer The audio buffer
	 * @param {Object} data Additional data
	 */
	const listen = async (buffer: Float32Array): Promise<void> => {
		console.log("listen")

		// 1. Transcribe the audio from the user
		const result = await transcriber(buffer)
		console.log({ result })

		const text: string = Array.isArray(result)
			? result[0]?.text?.trim() || ""
			: result?.text?.trim() || ""

		if (["", "[BLANK_AUDIO]"].includes(text)) {
			// If the transcription is empty or a blank audio, we skip the rest of the processing
			console.log("skip blank audio")
			return
		}
		// messages.push({ role: "user", content: text })

		self.postMessage({ type: "input", text })
	}

	// Track the number of samples after the last speech chunk
	let postSpeechSamples = 0
	const resetAfterRecording = (offset = 0): void => {
		self.postMessage({
			type: "status",
			status: "recording_end",
			message: "Transcribing...",
			duration: "until_next",
		})
		BUFFER.fill(0, offset)
		bufferPointer = offset
		isRecording = false
		postSpeechSamples = 0
	}

	const dispatchForTranscriptionAndResetAudioBuffer = (
		overflow?: Float32Array,
	): void => {
		// Get start and end time of the speech segment, minus the padding
		const now: number = Date.now()
		const end: number =
			now -
			((postSpeechSamples + SPEECH_PAD_SAMPLES) / INPUT_SAMPLE_RATE) * 1000
		const start: number = end - (bufferPointer / INPUT_SAMPLE_RATE) * 1000
		const duration: number = end - start
		const overflowLength: number = overflow?.length ?? 0

		// Send the audio buffer to the worker
		const buffer: Float32Array = BUFFER.slice(
			0,
			bufferPointer + SPEECH_PAD_SAMPLES,
		)

		const prevLength: number = prevBuffers.reduce((acc, b) => acc + b.length, 0)
		const paddedBuffer: Float32Array = new Float32Array(
			prevLength + buffer.length,
		)
		let offset = 0
		for (const prev of prevBuffers) {
			paddedBuffer.set(prev, offset)
			offset += prev.length
		}

		paddedBuffer.set(buffer, offset)

		listen(paddedBuffer)

		// Set overflow (if present) and reset the rest of the audio buffer
		if (overflow) {
			BUFFER.set(overflow, 0)
		}
		resetAfterRecording(overflowLength)
	}

	self.onmessage = async (event: MessageEvent): Promise<void> => {
		const { type, buffer } = event.data

		console.log("message received in worker", type, event.data)
		switch (type) {
			case "start_call":
				return
			case "end_call":
				return
			case "interrupt":
				return
			case "set_voice":
				return
			case "playback_ended":
				return
      // case "audio": {
		  //   const isSpeech: boolean = await vad(buffer)
      // }
		}

		const wasRecording: boolean = isRecording // Save current state
		    const isSpeech: boolean = await vad(buffer)

		if (!wasRecording && !isSpeech) {
			// We are not recording, and the buffer is not speech,
			// so we will probably discard the buffer. So, we insert
			// into a FIFO queue with maximum size of PREV_BUFFER_SIZE
			if (prevBuffers.length >= MAX_NUM_PREV_BUFFERS) {
				// If the queue is full, we discard the oldest buffer
				prevBuffers.shift()
			}
			prevBuffers.push(buffer)
			return
		}

		const remaining: number = BUFFER.length - bufferPointer
		if (buffer.length >= remaining) {
			// The buffer is larger than (or equal to) the remaining space in the global buffer,
			// so we perform transcription and copy the overflow to the global buffer
			BUFFER.set(buffer.subarray(0, remaining), bufferPointer)
			bufferPointer += remaining

			// Dispatch the audio buffer
			const overflow: Float32Array = buffer.subarray(remaining)
			dispatchForTranscriptionAndResetAudioBuffer(overflow)
			return
		}

		// The buffer is smaller than the remaining space in the global buffer,
		// so we copy it to the global buffer
		BUFFER.set(buffer, bufferPointer)
		bufferPointer += buffer.length

		if (isSpeech) {
			if (!isRecording) {
				// Indicate start of recording
				self.postMessage({
					type: "status",
					status: "recording_start",
					message: "Listening...",
					duration: "until_next",
				})
			}
			// Start or continue recording
			isRecording = true
			postSpeechSamples = 0 // Reset the post-speech samples
			return
		}

		postSpeechSamples += buffer.length

		// At this point we're confident that we were recording (wasRecording === true), but the latest buffer is not speech.
		// So, we check whether we have reached the end of the current audio chunk.
		if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
			// There was a short pause, but not long enough to consider the end of a speech chunk
			// (e.g., the speaker took a breath), so we continue recording
			return
		}

		if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
			// The entire buffer (including the new chunk) is smaller than the minimum
			// duration of a speech chunk, so we can safely discard the buffer.
			resetAfterRecording()
			return
		}

		dispatchForTranscriptionAndResetAudioBuffer()
	}
})()
