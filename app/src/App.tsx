import { PhoneOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { uuidv7 as uuid } from "uuidv7"

import type {
  FromWorkerMessage,
  ToWorkerMessage,
} from "@/listen-worker/types.js"
import type { OpportunityCard } from "@/types/opportunity-card.js"
import type { TranscriptEntry } from "@/types/transcript-entry.js"

import { SpeechIndicator } from "@/components/speech-indicator.js"
import { TranscriptPanel } from "@/components/transcript-panel"
import { Button } from "@/components/ui/button"
import { INPUT_SAMPLE_RATE } from "@/constants.js"
import { useSmartAutoscroll } from "@/hooks/useSmartAutoscroll.js"
import { calculateRMS } from "@/lib/calculate-rms"
import { trpc } from "./lib/trpc"

interface ListenWorker extends Worker {
  postMessage(message: ToWorkerMessage, transfer: Transferable[]): void
  postMessage(
    message: ToWorkerMessage,
    options?: StructuredSerializeOptions,
  ): void
}

export default function App() {
  const transcriptRef = useRef<HTMLDivElement>(null)
  const [callStartTime, setCallStartTime] = useState<number | null>(null)
  const [callStarted, setCallStarted] = useState(false)

  const [isListening, setIsListening] = useState(false)
  const [listeningScale, setListeningScale] = useState(1)

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [opportunityCards, setOpportunityCards] = useState<OpportunityCard[]>(
    [],
  )
  const [isProcessing, setIsProcessing] = useState(false)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState("00:00")
  const worker = useRef<ListenWorker | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)
  const node = useRef<AudioWorkletNode | null>(null)

  const scrollToEnd = useSmartAutoscroll(transcriptRef)

  // biome-ignore lint/correctness/useExhaustiveDependencies: any change to the transcript triggers scrollToEnd
  useEffect(() => {
    scrollToEnd()
  }, [transcript])

  useEffect(() => {
    if (!callStarted) {
      // Reset worker state after call ends
      worker.current?.postMessage({
        type: "end-call",
      })
    }
  }, [callStarted])

  useEffect(() => {
    if (callStarted && callStartTime) {
      const interval = setInterval(() => {
        const diff = Math.floor((Date.now() - callStartTime) / 1000)
        const minutes = String(Math.floor(diff / 60)).padStart(2, "0")
        const seconds = String(diff % 60).padStart(2, "0")
        setElapsedTime(`${minutes}:${seconds}`)
      }, 1000)
      return () => clearInterval(interval)
    }

    // Begin
    setElapsedTime("00:00")
  }, [callStarted, callStartTime])

  useEffect(() => {
    worker.current ??= new Worker(
      new URL("./listen-worker/worker.js", import.meta.url),
      {
        type: "module",
      },
    )

    const onMessage = ({ data }: { data: FromWorkerMessage }) => {
      switch (data.type) {
        case "ready":
          setReady(true)
          break
        case "recording-start":
          setIsListening(true)
          break
        case "recording-end":
          setIsListening(false)
          break
        case "input":
          setTranscript((transcript) => [
            ...transcript,
            { id: uuid(), text: data.text, timestamp: Date.now() },
          ])
          break
        case "error":
          return setError(data.error.message)
      }
    }
    const onError = (ev: ErrorEvent) => setError(ev.message)

    worker.current.addEventListener("message", onMessage)
    worker.current.addEventListener("error", onError)

    return () => {
      worker.current?.removeEventListener("message", onMessage)
      worker.current?.removeEventListener("error", onError)
    }
  }, [])

  useEffect(() => {
    if (!callStarted) return

    let worklet: AudioWorkletNode | undefined
    let inputAudioContext: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let ignore = false

    let outputAudioContext: AudioContext | undefined
    const audioStreamPromise = Promise.resolve(micStreamRef.current)

    audioStreamPromise
      .then(async (stream) => {
        if (ignore) return
        if (!stream) throw new Error("No stream provided")

        const AudioContext =
          "webkitAudioContext" in window
            ? (window.webkitAudioContext as typeof window.AudioContext)
            : window.AudioContext

        inputAudioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE })

        const analyser = inputAudioContext.createAnalyser()
        analyser.fftSize = 256
        source = inputAudioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const inputDataArray = new Uint8Array(analyser.frequencyBinCount)

        await inputAudioContext.audioWorklet.addModule(
          new URL("./vad-processor.js", import.meta.url),
        )
        worklet = new AudioWorkletNode(inputAudioContext, "vad-processor", {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
          channelCountMode: "explicit",
          channelInterpretation: "discrete",
        })

        source.connect(worklet)
        worklet.port.onmessage = (event: MessageEvent) => {
          const { buffer } = event.data
          worker.current?.postMessage({ type: "audio", buffer })
        }

        function updateVisualizers() {
          analyser.getByteTimeDomainData(inputDataArray)
          const rms = calculateRMS(inputDataArray)
          const targetScale = 1 + Math.min(1.25 * rms, 0.25)
          setListeningScale((prev) => prev + (targetScale - prev) * 0.25)

          requestAnimationFrame(updateVisualizers)
        }
        updateVisualizers()
      })
      .catch((err) => {
        setError(err.message)
        console.error(err)
      })

    return () => {
      ignore = true
      audioStreamPromise.then((s) => {
        const tracks = s?.getTracks()
        if (!tracks) return
        for (const track of tracks) {
          track.stop()
        }
      })
      source?.disconnect()
      worklet?.disconnect()
      inputAudioContext?.close()

      outputAudioContext?.close()
    }
  }, [callStarted])

  const handleStartCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: INPUT_SAMPLE_RATE,
        },
      })
      micStreamRef.current = stream

      setCallStartTime(Date.now())
      setCallStarted(true)
      worker.current?.postMessage({ type: "start-call" })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error(err)
    }
  }

  return (
    <div className="h-screen flex flex-col items-center bg-gray-50 p-4 relative">
      <div className="text-gray-700 text-4xl mt-4 mb-6">Gaia Circle</div>
      <div className="flex w-full h-[20dvh] gap-4">
        <div className="min-w-[260px] bg-white rounded-xl shadow-lg p-8 flex flex-wrap items-center justify-around">
          <SpeechIndicator
            callStarted={callStarted}
            error={error}
            ready={ready}
            isListening={isListening}
            elapsedTime={elapsedTime}
            listeningScale={listeningScale}
          />

          {callStarted ? (
            <Button
              onClick={() => {
                setCallStarted(false)
                setCallStartTime(null)
                setIsListening(false)
              }}
            >
              <PhoneOff className="w-5 h-5" />
              <span>End call</span>
            </Button>
          ) : (
            <Button
              className={`${
                ready ? "hover:bg-blue-400" : "opacity-50 cursor-not-allowed"
              }`}
              onClick={handleStartCall}
              disabled={!ready}
            >
              <span>Start call</span>
            </Button>
          )}
        </div>

        <TranscriptPanel
          transcript={transcript}
          transcriptRef={transcriptRef}
        />
      </div>
    </div>
  )
}
