import {
	type AutomaticSpeechRecognitionPipeline,
	pipeline,
} from "@huggingface/transformers"

import {
	INPUT_SAMPLE_RATE,
	MAX_BUFFER_DURATION,
	MAX_NUM_PREV_BUFFERS,
	MIN_SILENCE_DURATION_SAMPLES,
	MIN_SPEECH_DURATION_SAMPLES,
	SPEECH_PAD_SAMPLES,
} from "../constants"
import { DEVICE_DTYPE_CONFIGS, detectDevice } from "../lib/detect-device"

export type AutomaticSpeechRecognition = {
	transcriber: AutomaticSpeechRecognitionPipeline
	audioBuffer: Float32Array
	bufferPointer: number
	prevBuffers: Float32Array[]
	postSpeechSamples: number
}

export async function initAutomaticSpeechRecognition(): Promise<AutomaticSpeechRecognition> {
	const device = await detectDevice()

	const transcriber: AutomaticSpeechRecognitionPipeline = (await pipeline(
		"automatic-speech-recognition",
		"onnx-community/whisper-base",
		{
			device,
			dtype: DEVICE_DTYPE_CONFIGS[device as keyof typeof DEVICE_DTYPE_CONFIGS],
		},
		// biome-ignore lint/suspicious/noExplicitAny: avoids TS inference infinite loop
	)) as any

	await transcriber(new Float32Array(INPUT_SAMPLE_RATE)) // Compile shaders

	// Global audio buffer to store incoming audio
	const audioBuffer: Float32Array = new Float32Array(
		MAX_BUFFER_DURATION * INPUT_SAMPLE_RATE,
	)
	const bufferPointer = 0

	return {
		transcriber,
		audioBuffer,
		bufferPointer,
		prevBuffers: [],
		postSpeechSamples: 0,
	}
}

/**
 * Transcribe the audio buffer
 * @param {Float32Array} buffer The audio buffer
 * @param {Object} data Additional data
 */
export async function transcribe(
	asr: AutomaticSpeechRecognition,
	buffer: Float32Array,
): Promise<string> {
	const result = await asr.transcriber(buffer)

	const first = Array.isArray(result) ? result[0] : result

	const text = first?.text?.trim() ?? ""

	if (["[BLANK_AUDIO]"].includes(text)) {
		return ""
	}

	return text
}
