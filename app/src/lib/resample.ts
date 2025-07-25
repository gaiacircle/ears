/**
 * Resamples a Float32Array from a source sample rate to a target sample rate.
 *
 * @param {Float32Array} audioBuffer The input audio buffer.
 * @param {number} fromSampleRate The source sample rate.
 * @param {number} toSampleRate The target sample rate.
 * @returns {Float32Array} The resampled audio buffer.
 */
export function resample(
  audioBuffer: Float32Array,
  fromSampleRate: number,
  toSampleRate: number,
): Float32Array {
  if (fromSampleRate === toSampleRate) {
    return audioBuffer
  }

  const ratio = fromSampleRate / toSampleRate
  const newLength = Math.round(audioBuffer.length / ratio)
  const result = new Float32Array(newLength)

  let lastSample = 0
  let newCurrentSample = 0

  while (lastSample < result.length) {
    const nextOldSample = Math.round((lastSample + 1) * ratio)
    let E = 0
    let F = 0

    for (
      let currentSample = newCurrentSample;
      currentSample < nextOldSample && currentSample < audioBuffer.length;
      currentSample++
    ) {
      E += audioBuffer[currentSample]
      F++
    }

    result[lastSample] = E / F
    newCurrentSample = nextOldSample
    lastSample++
  }
  return result
}