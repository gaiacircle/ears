import {
  type AutomaticSpeechRecognitionPipeline,
  pipeline,
} from "@huggingface/transformers"

import {
  INPUT_SAMPLE_RATE,
  MAX_BUFFER_DURATION,
  MAX_PRE_ROLL_QUEUE_SIZE,
  MIN_SILENCE_DURATION_SAMPLES,
  MIN_SPEECH_DURATION_SAMPLES,
} from "../constants"
import { DEVICE_DTYPE_CONFIGS, detectDevice } from "../lib/detect-device"
import type {
  AudioChunk,
  AutomaticSpeechRecognition,
  WorkerAction,
} from "./types"

export async function initAutomaticSpeechRecognition(
  transcriber: AutomaticSpeechRecognition["transcriber"],
): Promise<AutomaticSpeechRecognition> {
  return {
    transcriber,
    preRollQueue: [],
    activeRecordingQueue: [],
  }
}

export function handleAudioChunk(
  asr: AutomaticSpeechRecognition,
  buffer: Float32Array,
  isSpeech: boolean,
): { updatedAsr: AutomaticSpeechRecognition; action: WorkerAction } {
  const isRecording = asr.activeRecordingQueue.length > 0
  const newChunk: AudioChunk = { buffer, isSpeech }

  // Not recording and no speech in chunk -> queue for possible future use
  if (!isRecording && !isSpeech) {
    const preRollQueue = [...asr.preRollQueue, newChunk]
    if (preRollQueue.length > MAX_PRE_ROLL_QUEUE_SIZE) {
      preRollQueue.shift()
    }
    return {
      updatedAsr: { ...asr, preRollQueue: preRollQueue },
      action: { type: "enqueue-prev-buffer" },
    }
  }

  // From here, we are either recording, or we just got a speech chunk.
  const newCurrentChunks = [...asr.activeRecordingQueue]
  let newPrevChunks = [...asr.preRollQueue]
  const actionType: WorkerAction["type"] = !isRecording
    ? "start-recording"
    : "continue-recording"

  if (actionType === "start-recording") {
    // Move all previous chunks to the current chunks
    newCurrentChunks.push(...newPrevChunks, newChunk)
    newPrevChunks = []
  } else {
    newCurrentChunks.push(newChunk)
  }

  const totalSampleLength = measureSampleLength(newCurrentChunks)

  // Buffer overflow case -> dispatch for transcription
  if (totalSampleLength > MAX_BUFFER_DURATION * INPUT_SAMPLE_RATE) {
    const overflow: AudioChunk[] = []
    let currentSize = 0
    const chunksForTranscription: AudioChunk[] = []
    for (const chunk of newCurrentChunks) {
      if (
        currentSize + chunk.buffer.length >
        MAX_BUFFER_DURATION * INPUT_SAMPLE_RATE
      ) {
        overflow.push(chunk)
      } else {
        chunksForTranscription.push(chunk)
        currentSize += chunk.buffer.length
      }
    }

    return {
      updatedAsr: { ...asr, activeRecordingQueue: chunksForTranscription },
      action: { type: "disptch-transcription", overflow },
    }
  }

  // If speech, continue recording and reset silence counter (implicitly)
  if (isSpeech) {
    return {
      updatedAsr: {
        ...asr,
        activeRecordingQueue: newCurrentChunks,
        preRollQueue: newPrevChunks,
      },
      action: { type: actionType },
    }
  }

  // Not speech, but we were recording. Check for end of speech.
  let silenceDuration = 0
  for (let i = newCurrentChunks.length - 1; i >= 0; i--) {
    const chunk = newCurrentChunks[i]
    if (chunk.isSpeech) {
      break
    }
    silenceDuration += chunk.buffer.length
  }

  if (silenceDuration < MIN_SILENCE_DURATION_SAMPLES) {
    // Not enough silence yet, continue recording
    return {
      updatedAsr: {
        ...asr,
        activeRecordingQueue: newCurrentChunks,
        preRollQueue: newPrevChunks,
      },
      action: { type: "continue-recording" },
    }
  }

  // Enough silence has passed. Decide whether to dispatch or discard.
  const speechDuration = newCurrentChunks.reduce(
    (sum, chunk) => sum + (chunk.isSpeech ? chunk.buffer.length : 0),
    0,
  )

  if (speechDuration < MIN_SPEECH_DURATION_SAMPLES) {
    // Speech too short, discard.
    return {
      updatedAsr: { ...asr, activeRecordingQueue: [], preRollQueue: [] },
      action: { type: "discard-recording" },
    }
  }

  // Speech is long enough and silence has been detected, so dispatch.
  return {
    updatedAsr: { ...asr, activeRecordingQueue: newCurrentChunks },
    action: {
      type: "disptch-transcription",
      overflow: [],
    },
  }
}

export function resetAsrState(
  asr: AutomaticSpeechRecognition,
): AutomaticSpeechRecognition {
  return {
    ...asr,
    preRollQueue: [],
    activeRecordingQueue: [],
  }
}
export function prepareAudioForTranscription(
  chunks: AudioChunk[],
): Float32Array {
  const totalSampleLength = measureSampleLength(chunks)

  const audioForTranscription = new Float32Array(totalSampleLength)

  let offset = 0
  for (const chunk of chunks) {
    audioForTranscription.set(chunk.buffer, offset)
    offset += chunk.buffer.length
  }

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
  const text = await asr.transcriber(buffer)

  if (["[BLANK_AUDIO]"].includes(text)) {
    return ""
  }

  return text
}

function measureSampleLength(chunks: AudioChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.buffer.length, 0)
}
