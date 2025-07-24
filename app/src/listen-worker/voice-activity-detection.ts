import {
	AutoModel,
	type PreTrainedModel,
	PretrainedConfig,
	Tensor,
} from "@huggingface/transformers"

import {
	EXIT_THRESHOLD,
	INPUT_SAMPLE_RATE,
	SPEECH_THRESHOLD,
} from "../constants"

export type VoiceActivityDetection = {
	model: PreTrainedModel
	sampleRateTensor: Tensor
	modelStateTensor: Tensor
}

export async function initVoiceActivityDetection(
	onError?: (error: unknown) => void,
): Promise<VoiceActivityDetection> {
	let model: PreTrainedModel
	try {
		model = await AutoModel.from_pretrained("onnx-community/silero-vad", {
			config: new PretrainedConfig({ model_type: "custom" }),
			dtype: "fp32", // Full-precision
		})
	} catch (error) {
		onError?.(error)
		throw error
	}

	// Set sample rate as a Tensor
	const sampleRateTensor: Tensor = new Tensor("int64", [INPUT_SAMPLE_RATE], [])

	// Initial state for VAD
	const modelStateTensor: Tensor = new Tensor(
		"float32",
		new Float32Array(2 * 1 * 128),
		[2, 1, 128],
	)

	return { model, sampleRateTensor, modelStateTensor }
}

export async function detectVoiceActivity(
	vad: VoiceActivityDetection,
	buffer: Float32Array,
	isAlreadySpeaking: boolean,
) {
	const input = new Tensor("float32", buffer, [1, buffer.length])

	const result = (await vad.model({
		input,
		sr: vad.sampleRateTensor,
		state: vad.modelStateTensor,
	})) as {
		output: Tensor
		stateN: Tensor
	}

	vad.modelStateTensor = result.stateN

	const speechScore: number = result.output.data[0]

	// Use heuristics to determine if the buffer is speech or not
	return (
		// Case 1: We are above the threshold (definitely speech)
		speechScore > SPEECH_THRESHOLD ||
		// Case 2: We are in the process of recording, and the probability is above the negative (exit) threshold
		(isAlreadySpeaking && speechScore >= EXIT_THRESHOLD)
	)
}
