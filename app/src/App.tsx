import { PhoneOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { INPUT_SAMPLE_RATE } from "./constants.js"
import WORKLET from "./play-worklet.js"
import type {
	FromWorkerMessage,
	ToWorkerMessage,
} from "./listen-worker/types.js"
import { useSmartAutoscroll } from "./hooks/useSmartAutoscroll.js"

interface ListenWorker extends Worker {
	postMessage(message: ToWorkerMessage, transfer: Transferable[]): void
	postMessage(
		message: ToWorkerMessage,
		options?: StructuredSerializeOptions,
	): void
}

type Verse = {
	content: string
}

export default function App() {
	const conversationRef = useRef<HTMLDivElement>(null)
	const [callStartTime, setCallStartTime] = useState<number | null>(null)
	const [callStarted, setCallStarted] = useState(false)

	const [isListening, setIsListening] = useState(false)
	const [listeningScale, setListeningScale] = useState(1)
	const [ripples, setRipples] = useState<number[]>([])

	const [conversation, setConversation] = useState<Verse[]>([])

	const [ready, setReady] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [elapsedTime, setElapsedTime] = useState("00:00")
	const worker = useRef<ListenWorker | null>(null)

	const micStreamRef = useRef<MediaStream | null>(null)
	const node = useRef<AudioWorkletNode | null>(null)

	const scrollToEnd = useSmartAutoscroll(conversationRef)

	// biome-ignore lint/correctness/useExhaustiveDependencies: change to conversation triggers scrollToEnd
	useEffect(() => {
		scrollToEnd()
	}, [conversation])

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
					setConversation((conversation) => [
						...conversation,
						{ content: data.text },
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

				function calculateRMS(array: Uint8Array) {
					let sum = 0
					for (let i = 0; i < array.length; ++i) {
						const normalized = array[i] / 128 - 1
						sum += normalized * normalized
					}
					const rms = Math.sqrt(sum / array.length)
					return rms
				}

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

				outputAudioContext = new AudioContext({
					sampleRate: 24000,
				})
				outputAudioContext.resume()

				const blob = new Blob([`(${WORKLET.toString()})()`], {
					type: "application/javascript",
				})
				const url = URL.createObjectURL(blob)
				await outputAudioContext.audioWorklet.addModule(url)
				URL.revokeObjectURL(url)

				node.current = new AudioWorkletNode(
					outputAudioContext,
					"buffered-audio-worklet-processor",
				)

				node.current.port.onmessage = (event: MessageEvent) => {
					if (event.data.type === "playback-ended") {
						worker.current?.postMessage({ type: "playback-ended" })
					}
				}

				const outputAnalyser = outputAudioContext.createAnalyser()
				outputAnalyser.fftSize = 256

				node.current.connect(outputAnalyser)
				outputAnalyser.connect(outputAudioContext.destination)

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

	useEffect(() => {
		if (!callStarted) return
		const interval = setInterval(() => {
			const id = Date.now()
			setRipples((prev) => [...prev, id])
			setTimeout(() => {
				setRipples((prev) => prev.filter((r) => r !== id))
			}, 1500)
		}, 1000)
		return () => clearInterval(interval)
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
						ripples={ripples}
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

				<div
					ref={conversationRef}
					className="w-full h-full bg-white rounded-xl shadow-lg overflow-y-auto"
				>
					{conversation.map((verse, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
						<div key={i} className="m-2 p-2">
							{verse.content}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

interface SpeechIndicatorProps {
	callStarted: boolean
	ripples: number[]
	error: string | null
	ready: boolean
	isListening: boolean
	elapsedTime: string
	listeningScale: number
}

function SpeechIndicator({
	callStarted,
	ripples,
	error,
	ready,
	isListening,
	elapsedTime,
	listeningScale,
}: SpeechIndicatorProps) {
	return (
		<div
			className={
				"relative flex items-center justify-center " +
				"size-16 flex-shrink-0 aspect-square"
			}
		>
			{callStarted &&
				ripples.map((id) => (
					<div
						key={id}
						className={
							"absolute inset-0 rounded-full border-2 border-green-200 " +
							"pointer-events-none"
						}
						style={{ animation: "ripple 1.5s ease-out forwards" }}
					/>
				))}
			{/* Pulsing loader while initializing */}
			<div
				className={`absolute ${callStarted ? "size-16" : "size-4"} rounded-full ${
					error ? "bg-red-200" : "bg-yellow-200"
				} ${!ready ? "animate-ping opacity-75" : ""}`}
				style={{ animationDuration: "1.5s" }}
			/>
			{/* Main rings */}
			<div
				className={`absolute ${callStarted ? "size-16" : "size-4"} rounded-full shadow-inner transition-transform duration-300 ease-out ${
					error ? "bg-red-200" : "bg-green-200"
				} ${!ready ? "opacity-0" : ""}`}
				style={{ transform: `scale(${listeningScale})` }}
			/>
			{/* Center text: show error if present, else existing statuses */}
			<div
				className={`absolute z-10 text-md text-center ${
					error ? "text-red-700" : "text-gray-700"
				}`}
			>
				{error ? (
					error
				) : (
					<>
						{!ready && "Loading..."}
						{isListening && `Listening... ${elapsedTime}`}
					</>
				)}
			</div>
		</div>
	)
}
