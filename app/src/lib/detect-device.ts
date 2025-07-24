function getGPU(navigator: Navigator) {
	if (!("gpu" in navigator)) return null

	return navigator.gpu as {
		requestAdapter: () => Promise<{ requestDevice: () => Promise<string> }>
	}
}

// Detect available device with fallback
export async function detectDevice(): Promise<"webgpu" | "wasm"> {
	// Check if WebGPU is supported and functional
	const gpu = getGPU(navigator)
	if (gpu) {
		try {
			const adapter = await gpu.requestAdapter()
			if (adapter) {
				const device = await adapter.requestDevice()
				if (device) {
					return "webgpu"
				}
			}
		} catch (error) {
			console.warn("WebGPU detection failed, falling back to WASM:", error)
		}
	}
	// Fallback to WASM
	return "wasm"
}

export type DtypeConfig =
	| "auto"
	| "fp32"
	| "fp16"
	| "q4"
	| "q8"
	| "int8"
	| "uint8"
	| "bnb4"
	| "q4f16"

export const DEVICE_DTYPE_CONFIGS: Record<
	string,
	{ encoder_model: DtypeConfig; decoder_model_merged: DtypeConfig }
> = {
	webgpu: {
		encoder_model: "fp32",
		decoder_model_merged: "fp32",
	},
	wasm: {
		encoder_model: "fp32",
		decoder_model_merged: "q8",
	},
}
