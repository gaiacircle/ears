interface SpeechIndicatorProps {
	callStarted: boolean
	ripples: number[]
	error: string | null
	ready: boolean
	isListening: boolean
	elapsedTime: string
	listeningScale: number
}

export function SpeechIndicator({
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
