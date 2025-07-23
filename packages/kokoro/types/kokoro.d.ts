import { StyleTextToSpeech2Model, AutoTokenizer, Tensor, RawAudio } from "@huggingface/transformers";
import { TextSplitterStream } from "./splitter.js";
import { VOICES } from "./voices.js";
/**
 * Options for generating audio from text
 */
export interface GenerateOptions {
    /** The voice to use for synthesis */
    voice?: keyof typeof VOICES;
    /** The speaking speed multiplier */
    speed?: number;
}
/**
 * Properties for streaming text processing
 */
export interface StreamProperties {
    /** The pattern to split the input text. If unset, the default sentence splitter will be used */
    split_pattern?: RegExp;
}
/**
 * Combined options for streaming generation
 */
export type StreamGenerateOptions = GenerateOptions & StreamProperties;
export declare class KokoroTTS {
    private model;
    private tokenizer;
    /**
     * Create a new KokoroTTS instance.
     * @param model - The StyleTextToSpeech2Model instance
     * @param tokenizer - The PreTrainedTokenizer instance
     */
    constructor(model: StyleTextToSpeech2Model, tokenizer: AutoTokenizer);
    /**
     * Load a KokoroTTS model from the Hugging Face Hub.
     * @param model_id - The model identifier on Hugging Face Hub
     * @param options - Additional loading options
     * @returns Promise resolving to a loaded KokoroTTS instance
     */
    static from_pretrained(model_id: string, { dtype, device, progress_callback, }?: {
        dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
        device?: "wasm" | "webgpu" | "cpu" | null;
        progress_callback?: import("@huggingface/transformers").ProgressCallback;
    }): Promise<KokoroTTS>;
    /**
     * Get available voices
     */
    get voices(): typeof VOICES;
    /**
     * List all available voices in a table format
     */
    list_voices(): void;
    /**
     * Validate the voice parameter and extract language code
     * @param voice - The voice identifier to validate
     * @returns The language code ("a" or "b")
     * @throws Error if the voice is not found
     */
    private _validate_voice;
    /**
     * Generate audio from text.
     * @param text - The input text to synthesize
     * @param options - Generation options
     * @returns Promise resolving to the generated audio
     */
    generate(text: string, { voice, speed }?: GenerateOptions): Promise<RawAudio>;
    /**
     * Generate audio from input token IDs.
     * @param input_ids - The tokenized input IDs
     * @param options - Generation options
     * @returns Promise resolving to the generated audio
     */
    generate_from_ids(input_ids: Tensor, { voice, speed }?: GenerateOptions): Promise<RawAudio>;
    /**
     * Generate audio from text in a streaming fashion.
     * @param text - The input text or TextSplitterStream
     * @param options - Streaming generation options
     * @returns Async generator yielding text chunks, phonemes, and audio
     */
    stream(text: string | TextSplitterStream, { voice, speed, split_pattern }?: StreamGenerateOptions): AsyncGenerator<{
        text: string;
        phonemes: string;
        audio: RawAudio;
    }, void, void>;
}
/**
 * Environment configuration for the Kokoro TTS system
 */
export declare const env: {
    /**
     * Set the cache directory for model files
     */
    cacheDir: string;
    /**
     * Set the WASM paths for ONNX runtime
     */
    wasmPaths: string;
};
export { TextSplitterStream };
//# sourceMappingURL=kokoro.d.ts.map