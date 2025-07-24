export type Voice = {
	name: string
	language: string
	gender: string
}

export type ToWorkerMessage =
	| {
			type: "start_call"
	  }
	| {
			type: "audio"
			buffer: Float32Array
	  }
	| {
			type: "end_call"
	  }
	| {
			type: "playback_ended"
	  }

export type FromWorkerMessage =
	| {
			type: "ready"
			message: string
			voices: Record<string, Voice>
	  }
	| {
			type: "recording_start"
			message: string
			duration: "until_next"
	  }
	| {
			type: "recording_end"
			message: string
			duration: "until_next"
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
			duration: "until_next"
	  }
	| {
			type: "error"
			error: Error
	  }
