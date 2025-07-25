/**
 * Return a function that takes a single buffer (Float32Array) argument and makes a
 * multi-part POST request to PARAKEET_ENDPOINT url with the 'file' multi-part form
 * field set to the binary value of the buffer. The response schema looks like this:
 *
 * {
 *   "success": true,
 *   "segments": [
 *     {
 *       "start": 6.88,
 *       "end": 7.6000000000000005,
 *       "text": "Hello."
 *     }
 *   ],
 *   "duration": 18.7,
 *   "message": "Transcription completed successfully"
 * }
 *
 * Parse the text out, join it, and return it.
 */
import {
  PARAKEET_ENDPOINT,
  PARAKEET_CLIENT_KEY,
  INPUT_SAMPLE_RATE,
} from "@/constants"
import type { AutomaticSpeechRecognition } from "./types"
import { encodeWAV } from "../lib/wav-encoder"

export async function initParakeetTranscriber(): Promise<
  AutomaticSpeechRecognition["transcriber"]
> {
  return async (buffer: Float32Array): Promise<string> => {
    const wavBlob = encodeWAV(buffer, INPUT_SAMPLE_RATE)
    const formData = new FormData()
    formData.append("file", wavBlob, "audio.wav")

    const response = await fetch(PARAKEET_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PARAKEET_CLIENT_KEY}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Parakeet transcription failed with status ${response.status}: ${errorText}`,
      )
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(`Parakeet transcription failed: ${result.message}`)
    }

    const text = result.segments.map((s: { text: string }) => s.text).join("\n")
    // console.log("resulting text", { text })

    return text
  }
}
