import type { TranscriptEntry } from "@/types/transcript-entry"
import type { RefObject } from "react"

interface TranscriptPanelProps {
	transcript: TranscriptEntry[]
	transcriptRef: RefObject<HTMLDivElement | null>
}

export function TranscriptPanel({
	transcript,
	transcriptRef,
}: TranscriptPanelProps) {
	return (
		<div
			ref={transcriptRef}
			className="w-full h-full bg-white rounded-xl shadow-lg overflow-y-auto"
		>
			{transcript.map((entry, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
				<div key={i} className="m-2 p-2">
					{entry.text}
				</div>
			))}
		</div>
	)
}
