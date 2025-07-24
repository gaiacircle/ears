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
} from "../constants"
import { DEVICE_DTYPE_CONFIGS, detectDevice } from "../lib/detect-device"

export type AutomaticSpeechRecognition = {
	transcriber: AutomaticSpeechRecognitionPipeline
	audioBuffer: Float32Array
	bufferPointer: number
	prevBuffers: Float32Array[]
	postSpeechSamples: number
}

export type WorkerAction =
	| { type: "QUEUE_PREV_BUFFER" }
	| { type: "START_RECORDING" }
	| { type: "CONTINUE_RECORDING" }
	| {
			type: "DISPATCH_TRANSCRIPTION"
			overflow: Float32Array
	  }
	| { type: "DISCARD_RECORDING" }

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

export function handleAudioChunk(
	asr: AutomaticSpeechRecognition,
	buffer: Float32Array,
	isSpeech: boolean,
	isRecording: boolean,
): { updatedAsr: AutomaticSpeechRecognition; action: WorkerAction } {
	// Not recording and no speech in buffer -> queue for possible future use
	if (!isRecording && !isSpeech) {
		const newPrevBuffers = [...asr.prevBuffers, buffer]
		if (newPrevBuffers.length > MAX_NUM_PREV_BUFFERS) {
			newPrevBuffers.shift()
		}
		return {
			updatedAsr: { ...asr, prevBuffers: newPrevBuffers },
			action: { type: "QUEUE_PREV_BUFFER" },
		}
	}

	// From here, we are either recording, or we just got a speech buffer.
	const newAudioBuffer = asr.audioBuffer.slice()
	let newBufferPointer = asr.bufferPointer

	// Buffer overflow case -> dispatch for transcription
	const remaining: number = newAudioBuffer.length - newBufferPointer
	if (buffer.length >= remaining) {
		newAudioBuffer.set(buffer.subarray(0, remaining), newBufferPointer)
		newBufferPointer += remaining
		const overflow: Float32Array = buffer.subarray(remaining)
		const updatedAsr = {
			...asr,
			audioBuffer: newAudioBuffer,
			bufferPointer: newBufferPointer,
		}
		return {
			updatedAsr,
			action: { type: "DISPATCH_TRANSCRIPTION", overflow },
		}
	}

	// Default case -> copy buffer to main audio buffer
	newAudioBuffer.set(buffer, newBufferPointer)
	newBufferPointer += buffer.length

	let updatedAsr = {
		...asr,
		audioBuffer: newAudioBuffer,
		bufferPointer: newBufferPointer,
	}

	if (isSpeech) {
		// New recording, or continuing recording
		const actionType = !isRecording ? "START_RECORDING" : "CONTINUE_RECORDING"
		updatedAsr = { ...updatedAsr, postSpeechSamples: 0 } // Reset silence counter
		return {
			updatedAsr,
			action: { type: actionType },
		}
	}

	// Not speech, but we were recording. Check for end of speech.
	const newPostSpeechSamples = asr.postSpeechSamples + buffer.length
	updatedAsr = { ...updatedAsr, postSpeechSamples: newPostSpeechSamples }

	if (newPostSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
		// Not enough silence yet, continue recording
		return {
			updatedAsr,
			action: { type: "CONTINUE_RECORDING" },
		}
	}

	// Enough silence has passed. Decide whether to dispatch or discard.
	// We need to check if the buffer is long enough to be considered speech.
	if (updatedAsr.bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
		// Speech too short, discard.
		return {
			updatedAsr, // state will be reset in worker
			action: { type: "DISCARD_RECORDING" },
		}
	}

	// Speech is long enough and silence has been detected, so dispatch.
	// We have to create a new Float32Array for the overflow, since we don't have one in this case.
	const overflow = new Float32Array(0)
	return {
		updatedAsr,
		action: {
			type: "DISPATCH_TRANSCRIPTION",
			overflow,
		},
	}
}

export function resetAudioBuffer(
	asr: AutomaticSpeechRecognition,
	overflow: Float32Array = new Float32Array(0),
): AutomaticSpeechRecognition {
	const allPrev = asr.prevBuffers.reduce((acc, val) => {
		const newAcc = new Float32Array(acc.length + val.length)
		newAcc.set(acc)
		newAcc.set(val, acc.length)
		return newAcc
	}, new Float32Array(0))

	const dataToCopy = new Float32Array(allPrev.length + overflow.length)
	dataToCopy.set(allPrev)
	dataToCopy.set(overflow, allPrev.length)

	const newAudioBuffer = new Float32Array(asr.audioBuffer.length)
	newAudioBuffer.set(dataToCopy)

	return {
		...asr,
		audioBuffer: newAudioBuffer,
		bufferPointer: dataToCopy.length,
		prevBuffers: [], // Clear prevBuffers
	}
}

export function resetAsrState(
	asr: AutomaticSpeechRecognition,
): AutomaticSpeechRecognition {
	return {
		...asr,
		bufferPointer: 0,
		postSpeechSamples: 0,
		prevBuffers: [],
	}
}
export function prepareAudioForTranscription(
	asr: AutomaticSpeechRecognition,
	speechBuffer: Float32Array,
): Float32Array {
	const prevLength = asr.prevBuffers.reduce(
		(sum, buf) => sum + buf.length,
		0,
	)
	const audioForTranscription = new Float32Array(
		prevLength + speechBuffer.length,
	)

	let offset = 0
	for (const prev of asr.prevBuffers) {
		audioForTranscription.set(prev, offset)
		offset += prev.length
	}
	audioForTranscription.set(speechBuffer, offset)

	return audioForTranscription
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
