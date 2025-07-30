import { useEffect, useRef } from "react"
import autoScroll from "@yrobot/auto-scroll"

import type { TranscriptEntry } from "@/types/transcript-entry"

interface TranscriptPanelProps {
  transcript: TranscriptEntry[]
}

export function TranscriptPanel({ transcript }: TranscriptPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = panelRef.current
    if (!container) return
    return autoScroll({ container })
  }, [])

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
