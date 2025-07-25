export function calculateRMS(array: Uint8Array) {
	let sum = 0
	for (let i = 0; i < array.length; ++i) {
		const normalized = array[i] / 128 - 1
		sum += normalized * normalized
	}
	const rms = Math.sqrt(sum / array.length)
	return rms
}
