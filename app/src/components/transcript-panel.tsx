import { useSmartAutoscroll } from "@/hooks/use-smart-autoscroll"
import type { TranscriptEntry } from "@/types/transcript-entry"
import { type RefObject, useEffect, useRef } from "react"

interface TranscriptPanelProps {
  transcript: TranscriptEntry[]
}

export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = useSmartAutoscroll(panelRef)

  // biome-ignore lint/correctness/useExhaustiveDependencies: any change to the transcript triggers scrollToEnd
  useEffect(scrollToEnd, [transcript])

  return (
    <div
      ref={panelRef}
      className="w-full h-full bg-white rounded-xl shadow-sm overflow-y-auto"
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
