import path from "path"
import fs from "fs/promises"

/**
 * Voice metadata structure
 */
export interface Voice {
	/** Display name of the voice */
	name: string
	/** Language code */
	language: string
	/** Gender of the voice */
	gender: string
	/** Special traits or emojis associated with the voice */
	traits?: string
	/** Target quality grade */
	targetQuality: string
	/** Overall grade achieved */
	overallGrade: string
}

/**
 * Collection of available voices
 */
export const VOICES = {
	af_heart: {
		name: "Heart",
		language: "en-us",
		gender: "Female",
		targetQuality: "A",
		overallGrade: "A",
	},
} satisfies { [key: string]: Voice }

/**
 * The base URL for fetching voice data files.
 */
let voiceDataUrl =
	"https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices"

/**
 * Retrieves the current voice data URL.
 *
 * @returns The current voice data URL.
 */
export function getVoiceDataUrl(): string {
	return voiceDataUrl
}

/**
 * Sets a new voice data URL.
 *
 * @param url - The new URL to set for voice data.
 * @throws Will throw an error if the URL is not a valid non-empty string.
 */
export function setVoiceDataUrl(url: string): void {
	if (typeof url === "string" && url.trim() !== "") {
		voiceDataUrl = url
	} else {
		throw new Error("Invalid URL")
	}
}

/**
 * Retrieves voice data from a file
 * @param id - The voice identifier
 * @returns Promise resolving to the voice data buffer
 */
async function getVoiceFile(id: keyof typeof VOICES): Promise<ArrayBufferLike> {
	if (fs && Object.hasOwn(fs, "readFile")) {
		const dirname =
			typeof __dirname !== "undefined" ? __dirname : import.meta.dirname
		const file = path.resolve(dirname, `../voices/${id}.bin`)
		const { buffer } = await fs.readFile(file)
		return buffer
	}

	const url = `${voiceDataUrl}/${id}.bin`

	let cache: Cache | undefined
	try {
		if (typeof caches !== "undefined") {
			cache = await caches.open("kokoro-voices")
			const cachedResponse = await cache.match(url)
			if (cachedResponse) {
				return await cachedResponse.arrayBuffer()
			}
		}
	} catch (e) {
		console.warn("Unable to open cache", e)
	}

	// No cache, or cache failed to open. Fetch the file.
	const response = await fetch(url)
	const buffer = await response.arrayBuffer()

	if (cache) {
		try {
			// NOTE: We use `new Response(buffer, ...)` instead of `response.clone()` to handle LFS files
			await cache.put(
				url,
				new Response(buffer, {
					headers: response.headers,
				}),
			)
		} catch (e) {
			console.warn("Unable to cache file", e)
		}
	}

	return buffer
}

const VOICE_CACHE = new Map<keyof typeof VOICES, Float32Array>()

/**
 * Retrieves voice data for a specific voice
 * @param voice - The voice identifier
 * @returns Promise resolving to the voice data as a Float32Array
 */
export async function getVoiceData(
	voice: keyof typeof VOICES,
): Promise<Float32Array> {
	let buffer = VOICE_CACHE.get(voice)

	if (!buffer) {
		buffer = new Float32Array(await getVoiceFile(voice))
		VOICE_CACHE.set(voice, buffer)
	}

	return buffer
}
