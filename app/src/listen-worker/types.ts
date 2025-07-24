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
