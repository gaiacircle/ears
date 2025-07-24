import {
	MAX_NUM_PREV_BUFFERS,
	MIN_SILENCE_DURATION_SAMPLES,
	MIN_SPEECH_DURATION_SAMPLES,
	SPEECH_PAD_SAMPLES,
} from "../constants"
import {
	initAutomaticSpeechRecognition,
	transcribe,
} from "./automatic-speech-recognition"

import {
	detectVoiceActivity,
	initVoiceActivityDetection,
} from "./voice-activity-detection"

const worker = async (): Promise<void> => {
	self.postMessage({
		type: "info",
		message: "Loading models...",
		duration: "until_next",
	})

	// Load models
	const vad = await initVoiceActivityDetection()

	const asr = await initAutomaticSpeechRecognition()

	self.postMessage({
		type: "status",
		status: "ready",
		message: "Ready!",
		voices: {},
	})

	// Whether we are in the process of adding audio to the buffer
	let isRecording = false

	// Track the number of samples after the last speech chunk
	let postSpeechSamples = 0
	const resetAfterRecording = (offset = 0): void => {
		self.postMessage({
			type: "status",
			status: "recording_end",
			message: "Transcribing...",
			duration: "until_next",
		})
		asr.audioBuffer.fill(0, offset)
		asr.bufferPointer = offset
		isRecording = false
		postSpeechSamples = 0
	}

	const dispatchForTranscriptionAndResetAudioBuffer = (
		overflow?: Float32Array,
	): void => {
		const overflowLength: number = overflow?.length ?? 0

		// Send the audio buffer to the worker
		const buffer: Float32Array = asr.audioBuffer.slice(
			0,
			asr.bufferPointer + SPEECH_PAD_SAMPLES,
		)

		const prevLength: number = asr.prevBuffers.reduce(
			(acc, b) => acc + b.length,
			0,
		)
		const paddedBuffer: Float32Array = new Float32Array(
			prevLength + buffer.length,
		)
		let offset = 0
		for (const prev of asr.prevBuffers) {
			paddedBuffer.set(prev, offset)
			offset += prev.length
		}

		paddedBuffer.set(buffer, offset)

		transcribe(asr, paddedBuffer).then((text: string) => {
			if (!text) {
				// If the transcription is empty or a blank audio, we skip the rest of the processing
				console.log("skip blank audio")
			}

			self.postMessage({ type: "input", text })
		})

		// Set overflow (if present) and reset the rest of the audio buffer
		if (overflow) {
			asr.audioBuffer.set(overflow, 0)
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

		const isSpeech: boolean = await detectVoiceActivity(
			vad,
			buffer,
			isRecording,
		)

		if (!isRecording && !isSpeech) {
			// We are not recording, and the buffer is not speech,
			// so we will probably discard the buffer. So, we insert
			// into a FIFO queue with maximum size of PREV_BUFFER_SIZE
			if (asr.prevBuffers.length >= MAX_NUM_PREV_BUFFERS) {
				// If the queue is full, we discard the oldest buffer
				asr.prevBuffers.shift()
			}
			asr.prevBuffers.push(buffer)
			return
		}

		const remaining: number = asr.audioBuffer.length - asr.bufferPointer
		if (buffer.length >= remaining) {
			// The buffer is larger than (or equal to) the remaining space in the global buffer,
			// so we perform transcription and copy the overflow to the global buffer
			asr.audioBuffer.set(buffer.subarray(0, remaining), asr.bufferPointer)
			asr.bufferPointer += remaining

			// Dispatch the audio buffer
			const overflow: Float32Array = buffer.subarray(remaining)
			dispatchForTranscriptionAndResetAudioBuffer(overflow)
			return
		}

		// The buffer is smaller than the remaining space in the global buffer,
		// so we copy it to the global buffer
		asr.audioBuffer.set(buffer, asr.bufferPointer)
		asr.bufferPointer += buffer.length

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

		if (asr.bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
			// The entire buffer (including the new chunk) is smaller than the minimum
			// duration of a speech chunk, so we can safely discard the buffer.
			resetAfterRecording()
			return
		}

		dispatchForTranscriptionAndResetAudioBuffer()
	}
}

try {
	worker()
} catch (error) {
	self.postMessage({ error })
	throw error
}
