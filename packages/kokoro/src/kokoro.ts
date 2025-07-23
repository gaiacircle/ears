import {
	AutoTokenizer,
	env as hf,
	RawAudio,
	StyleTextToSpeech2Model,
	Tensor,
} from "@huggingface/transformers"
import { phonemize } from "./phonemize.js"
import { TextSplitterStream } from "./splitter.js"
import { getVoiceData, VOICES } from "./voices.js"

const STYLE_DIM = 256
const SAMPLE_RATE = 24000

/**
 * Options for generating audio from text
 */
export interface GenerateOptions {
	/** The voice to use for synthesis */
	voice?: keyof typeof VOICES
	/** The speaking speed multiplier */
	speed?: number
}

/**
 * Properties for streaming text processing
 */
export interface StreamProperties {
	/** The pattern to split the input text. If unset, the default sentence splitter will be used */
	split_pattern?: RegExp
}

/**
 * Combined options for streaming generation
 */
export type StreamGenerateOptions = GenerateOptions & StreamProperties

export class KokoroTTS {
	private model: StyleTextToSpeech2Model
	private tokenizer: AutoTokenizer

	/**
	 * Create a new KokoroTTS instance.
	 * @param model - The StyleTextToSpeech2Model instance
	 * @param tokenizer - The PreTrainedTokenizer instance
	 */
	constructor(model: StyleTextToSpeech2Model, tokenizer: AutoTokenizer) {
		this.model = model
		this.tokenizer = tokenizer
	}

	/**
	 * Load a KokoroTTS model from the Hugging Face Hub.
	 * @param model_id - The model identifier on Hugging Face Hub
	 * @param options - Additional loading options
	 * @returns Promise resolving to a loaded KokoroTTS instance
	 */
	static async from_pretrained(
		model_id: string,
		{
			dtype = "fp32" as const,
			device = null,
			progress_callback = null,
		}: {
			dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16"
			device?: "wasm" | "webgpu" | "cpu" | null
			progress_callback?: import("@huggingface/transformers").ProgressCallback
		} = {},
	): Promise<KokoroTTS> {
		const model = StyleTextToSpeech2Model.from_pretrained(model_id, {
			progress_callback,
			dtype,
			device,
		})
		const tokenizer = AutoTokenizer.from_pretrained(model_id, {
			progress_callback,
		})

		const info = await Promise.all([model, tokenizer])
		return new KokoroTTS(...info)
	}

	/**
	 * Get available voices
	 */
	get voices(): typeof VOICES {
		return VOICES
	}

	/**
	 * List all available voices in a table format
	 */
	list_voices(): void {
		console.table(VOICES)
	}

	/**
	 * Validate the voice parameter and extract language code
	 * @param voice - The voice identifier to validate
	 * @returns The language code ("a" or "b")
	 * @throws Error if the voice is not found
	 */
	private _validate_voice(voice: string): "a" | "b" {
		if (!VOICES[voice]) {
			console.error(`Voice "${voice}" not found. Available voices:`)
			console.table(VOICES)
			throw new Error(
				`Voice "${voice}" not found. Should be one of: ${Object.keys(VOICES).join(", ")}.`,
			)
		}
		const language = voice.at(0) as "a" | "b" // "a" or "b"
		return language
	}

	/**
	 * Generate audio from text.
	 * @param text - The input text to synthesize
	 * @param options - Generation options
	 * @returns Promise resolving to the generated audio
	 */
	async generate(
		text: string,
		{ voice = "af_heart", speed = 1 }: GenerateOptions = {},
	): Promise<RawAudio> {
		const language = this._validate_voice(voice)

		const phonemes = await phonemize(text, language)
		const { input_ids } = await (this.tokenizer as any)(phonemes, {
			truncation: true,
		})

		return this.generate_from_ids(input_ids, { voice, speed })
	}

	/**
	 * Generate audio from input token IDs.
	 * @param input_ids - The tokenized input IDs
	 * @param options - Generation options
	 * @returns Promise resolving to the generated audio
	 */
	async generate_from_ids(
		input_ids: Tensor,
		{ voice = "af_heart", speed = 1 }: GenerateOptions = {},
	): Promise<RawAudio> {
		// Select voice style based on number of input tokens
		const lastDim = input_ids.dims.at(-1)
		if (lastDim === undefined) throw new Error("Last dim required")

		const num_tokens = Math.min(Math.max(lastDim - 2, 0), 509)

		// Load voice style
		const data = await getVoiceData(voice)
		const offset = num_tokens * STYLE_DIM
		const voiceData = data.slice(offset, offset + STYLE_DIM)

		// Prepare model inputs
		const inputs = {
			input_ids,
			style: new Tensor("float32", voiceData, [1, STYLE_DIM]),
			speed: new Tensor("float32", [speed], [1]),
		}

		// Generate audio
		const { waveform } = await this.model(inputs)
		return new RawAudio(waveform.data, SAMPLE_RATE)
	}

	/**
	 * Generate audio from text in a streaming fashion.
	 * @param text - The input text or TextSplitterStream
	 * @param options - Streaming generation options
	 * @returns Async generator yielding text chunks, phonemes, and audio
	 */
	async *stream(
		text: string | TextSplitterStream,
		{
			voice = "af_heart",
			speed = 1,
			split_pattern = null,
		}: StreamGenerateOptions = {},
	): AsyncGenerator<
		{ text: string; phonemes: string; audio: RawAudio },
		void,
		void
	> {
		const language = this._validate_voice(voice)

		let splitter: TextSplitterStream
		if (text instanceof TextSplitterStream) {
			splitter = text
		} else if (typeof text === "string") {
			splitter = new TextSplitterStream()
			const chunks = split_pattern
				? text
						.split(split_pattern)
						.map((chunk) => chunk.trim())
						.filter((chunk) => chunk.length > 0)
				: [text]
			splitter.push(...chunks)
		} else {
			throw new Error(
				"Invalid input type. Expected string or TextSplitterStream.",
			)
		}

		for await (const sentence of splitter) {
			const phonemes = await phonemize(sentence, language)
			const { input_ids } = await (this.tokenizer as any)(phonemes, {
				truncation: true,
			})

			// TODO: There may be some cases where - even with splitting - the text is too long.
			// In that case, we should split the text into smaller chunks and process them separately.
			// For now, we just truncate these exceptionally long chunks
			const audio = await this.generate_from_ids(input_ids, { voice, speed })
			yield { text: sentence, phonemes, audio }
		}
	}
}

/**
 * Environment configuration for the Kokoro TTS system
 */
export const env = {
	/**
	 * Set the cache directory for model files
	 */
	set cacheDir(value: string) {
		hf.cacheDir = value
	},
	/**
	 * Get the current cache directory
	 */
	get cacheDir(): string {
		return hf.cacheDir
	},
	/**
	 * Set the WASM paths for ONNX runtime
	 */
	set wasmPaths(value: string) {
		hf.backends.onnx.wasm.wasmPaths = value
	},
	/**
	 * Get the current WASM paths
	 */
	get wasmPaths(): string {
		const paths = hf.backends.onnx.wasm.wasmPaths
		return typeof paths === "string" ? paths : JSON.stringify(paths)
	},
}

export { TextSplitterStream }
