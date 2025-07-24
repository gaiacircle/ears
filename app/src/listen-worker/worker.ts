import {
	handleAudioChunk,
	initAutomaticSpeechRecognition,
	prepareAudioForTranscription,
	resetAsrState,
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

	const resetAfterRecording = (): void => {
		postMessage({
			type: "recording-end",
			message: "Transcribing...",
		})
		asr = resetAsrState(asr)
	}

	const dispatchTranscription = (): void => {
		const audioForTranscription = prepareAudioForTranscription(asr.activeRecordingQueue)

		transcribe(asr, audioForTranscription).then((text: string) => {
			if (!text) {
				// If the transcription is empty or a blank audio, we skip the rest of the processing
				console.log("skip blank audio")
			} else {
				postMessage({ type: "input", text })
			}
		})

		asr = resetAsrState(asr)
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
						asr.activeRecordingQueue.length > 0,
					)

					const { updatedAsr, action } = handleAudioChunk(asr, buffer, isSpeech)
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
							break
						case "disptch-transcription":
							dispatchTranscription()
							// After transcription, if there's overflow, it becomes the new currentChunks
							asr = { ...asr, activeRecordingQueue: action.overflow, preRollQueue: [] }
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
