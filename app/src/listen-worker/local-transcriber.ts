import { INPUT_SAMPLE_RATE } from "@/constants"
import { detectDevice, DEVICE_DTYPE_CONFIGS } from "@/lib/detect-device"
import { pipeline } from "@huggingface/transformers"
import type { AutomaticSpeechRecognition } from "./types"

export async function initLocalTranscriber(): Promise<
  AutomaticSpeechRecognition["transcriber"]
> {
  const device = await detectDevice()

  console.log("ASR using device", device)

  const transcriber = (await pipeline(
    "automatic-speech-recognition",
    // "onnx-community/moonshine-base-ONNX",
    // "onnx-community/whisper-base",
    "onnx-community/lite-whisper-large-v3-turbo-fast-ONNX",
    {
      device,
      dtype: DEVICE_DTYPE_CONFIGS[device],
    },
    // biome-ignore lint/suspicious/noExplicitAny: avoids TS inference infinite loop
  )) as any

  await transcriber(new Float32Array(INPUT_SAMPLE_RATE)) // Compile shaders

  return async (buffer: Float32Array) => {
    const result = await transcriber(buffer)

    const first = Array.isArray(result) ? result[0] : result

    return first?.text?.trim() ?? ""
  }
}
