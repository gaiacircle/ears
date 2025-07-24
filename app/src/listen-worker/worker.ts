import { SPEECH_PAD_SAMPLES } from "../constants"
import {
	handleAudioChunk,
	initAutomaticSpeechRecognition,
	prepareAudioForTranscription,
	resetAsrState,
	resetAudioBuffer,
	transcribe,
} from "./automatic-speech-recognition"
import type { FromWorkerMessage } from "./types"
import {
	detectVoiceActivity,
	initVoiceActivityDetection,
} from "./voice-activity-detection"

function postMessage(message: FromWorkerMessage): void {
	self.postMessage(message)
}

const worker = async (): Promise<void> => {
	postMessage({
		type: "info",
		message: "Loading models...",
	})

	// Load models
	const vad = await initVoiceActivityDetection()

	let asr = await initAutomaticSpeechRecognition()

	postMessage({
		type: "ready",
		message: "Ready!",
		voices: {},
	})

	// Whether we are in the process of adding audio to the buffer
	let isRecording = false

	// Track the number of samples after the last speech chunk
	const resetAfterRecording = (): void => {
		// This function should now reset the ASR state by calling the new resetAsrState function.
		// asr = resetAsrState(asr);
		postMessage({
			type: "recording-end",
			message: "Transcribing...",
		})
		asr = resetAsrState(asr)
		isRecording = false
	}

	const dispatchTranscription = (overflow?: Float32Array): void => {
		const speechBuffer: Float32Array = asr.audioBuffer.slice(
			0,
			asr.bufferPointer + SPEECH_PAD_SAMPLES,
		)

		const audioForTranscription = prepareAudioForTranscription(
			asr,
			speechBuffer,
		)

		transcribe(asr, audioForTranscription).then((text: string) => {
			if (!text) {
				// If the transcription is empty or a blank audio, we skip the rest of the processing
				console.log("skip blank audio")
			}

			postMessage({ type: "input", text })
		})

		asr = resetAudioBuffer(asr, overflow)
		resetAfterRecording()
	}

	self.onmessage = async (
		event: MessageEvent<{
			type: string
			buffer: Float32Array
		}>,
	): Promise<void> => {
		const { type, buffer } = event.data

		switch (type) {
			case "start-call":
				break
			case "audio":
				{
					const isSpeech: boolean = await detectVoiceActivity(
						vad,
						buffer,
						isRecording,
					)

					const { updatedAsr, action } = handleAudioChunk(
						asr,
						buffer,
						isSpeech,
						isRecording,
					)
					asr = updatedAsr

					switch (action.type) {
						case "enqueue-prev-buffer":
						case "continue-recording":
							// No worker-side effects needed
							break
						case "start-recording":
							postMessage({
								type: "recording-start",
								message: "Listening...",
							})
							isRecording = true
							break
						case "disptch-transcription":
							dispatchTranscription(action.overflow)
							asr = resetAudioBuffer(asr, action.overflow)
							break
						case "discard-recording":
							resetAfterRecording()
							break
					}
				}
				break
			case "end-call":
				break
		}
	}
}

try {
	worker()
} catch (error) {
	if (error instanceof Error) {
		postMessage({ type: "error", error })
	} else {
		postMessage({ type: "error", error: new Error("Unknown error") })
	}
	throw error
}
