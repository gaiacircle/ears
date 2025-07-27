import { PhoneOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { uuidv7 as uuid } from "uuidv7"

import type { FromWorkerMessage, ToWorkerMessage } from "@/listen-worker/types"
import type { OpportunityCard } from "@/types/opportunity-card"
import type { TranscriptEntry } from "@/types/transcript-entry"

import { SpeechIndicator } from "@/components/speech-indicator"
import { TranscriptPanel } from "@/components/transcript-panel"
import { Button } from "@/components/ui/button"
import { INPUT_SAMPLE_RATE } from "@/constants"
import { calculateRMS } from "@/lib/calculate-rms"
import { trpc } from "./lib/trpc"
import { OpportunityPanel } from "./components/opportunity-panel"
import vadProcessorUrl from "./vad-processor.js?worker&url"
import listenWorkerUrl from "./listen-worker/worker.js?worker&url"

interface ListenWorker extends Worker {
  postMessage(message: ToWorkerMessage, transfer: Transferable[]): void
  postMessage(
    message: ToWorkerMessage,
    options?: StructuredSerializeOptions,
  ): void
}

export default function App() {
  const [callStartTime, setCallStartTime] = useState<number | null>(null)
  const [callStarted, setCallStarted] = useState(false)

  const [isListening, setIsListening] = useState(false)
  const [listeningScale, setListeningScale] = useState(1)

  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [opportunityCards, setOpportunityCards] = useState<OpportunityCard[]>(
    [],
  )

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState("00:00")
  const worker = useRef<ListenWorker | null>(null)

  const micStreamRef = useRef<MediaStream | null>(null)

  const chatMutation = trpc.chat.useMutation()

  useEffect(() => {
    // window.onkeydown((ev) => {})
    const action = (ev: KeyboardEvent) => {
      if (ev.key === "y" && (ev.metaKey || ev.ctrlKey)) {
        const id = uuid()
        setOpportunityCards((cards) => [
          ...cards,
          {
            id,
            timestamp: Date.now(),
            content: uuid(),
            explanation: id,
            trigger: "key",
            type: "question",
          },
        ])
      }
    }
    window.addEventListener("keydown", action)
    return () => window.removeEventListener("keydown", action)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    const recentMessages = transcript.slice(-3).map((e) => e.text)

    if (recentMessages.length > 0) {
      chatMutation.mutate(
        {
          recentMessages,
          recentOpportunities: opportunityCards.slice(-3).map((o) => o.content),
        },
        {
          onSuccess(data, variables, context) {
            const opportunities = data.opportunities

            setOpportunityCards((cards) => [...cards, ...opportunities])
          },
        },
      )
    }
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
    worker.current ??= new Worker(listenWorkerUrl, { type: "module" })

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
          {
            setTranscript((transcript) => [
              ...transcript,
              { id: uuid(), text: data.text, timestamp: Date.now() },
            ])
          }
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

        inputAudioContext = new AudioContext()

        const analyser = inputAudioContext.createAnalyser()
        analyser.fftSize = 256
        source = inputAudioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const inputDataArray = new Uint8Array(analyser.frequencyBinCount)

        await inputAudioContext.audioWorklet.addModule(vadProcessorUrl)
        worklet = new AudioWorkletNode(inputAudioContext, "vad-processor", {
          processorOptions: {
            sampleRate: inputAudioContext.sampleRate,
          },
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
    <div className="h-screen w-full bg-gray-50 px-4 flex flex-col items-center">
      <div className="h-screen w-full max-w-[800px] py-4 flex flex-col items-center justify-center">
        <div className="text-gray-700 text-4xl mt-4 mb-6">Gaia Circle</div>
        <div className="flex w-full h-[20dvh] gap-4">
          <div className="min-w-[260px] bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-around">
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
                <span>End session</span>
              </Button>
            ) : (
              <Button
                className={`${
                  ready ? "hover:bg-blue-400" : "opacity-50 cursor-not-allowed"
                }`}
                onClick={handleStartCall}
                disabled={!ready}
              >
                <span>Start assistant</span>
              </Button>
            )}
          </div>

          <TranscriptPanel transcript={transcript} />
        </div>

        <OpportunityPanel
          opportunityCards={opportunityCards}
          dismissCard={(...args) => {
            console.log("dismiss", args)
          }}
        />
      </div>
    </div>
  )
}
