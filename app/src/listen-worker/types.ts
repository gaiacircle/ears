export type Voice = {
  name: string
  language: string
  gender: string
}

export type ToWorkerMessage =
  | {
      type: "start-call"
    }
  | {
      type: "audio"
      buffer: Float32Array
    }
  | {
      type: "end-call"
    }
  | {
      type: "playback-ended"
    }

export type FromWorkerMessage =
  | {
      type: "ready"
      message: string
      voices: Record<string, Voice>
    }
  | {
      type: "recording-start"
      message: string
    }
  | {
      type: "recording-end"
      message: string
    }
  | {
      type: "input"
      text: string
    }
  | {
      type: "output"
      text: string
      audio: Float32Array
    }
  | {
      type: "info"
      message: string
    }
  | {
      type: "error"
      error: Error
    }

export type AutomaticSpeechRecognition = {
  transcriber: (buffer: Float32Array) => Promise<string>
  preRollQueue: AudioChunk[]
  activeRecordingQueue: AudioChunk[]
}

export type AudioChunk = {
  buffer: Float32Array
  isSpeech: boolean
}

export type WorkerAction =
  | { type: "enqueue-prev-buffer" }
  | { type: "start-recording" }
  | { type: "continue-recording" }
  | {
      type: "disptch-transcription"
      overflow: AudioChunk[]
    }
  | { type: "discard-recording" }
