/**
 * Voice metadata structure
 */
export interface Voice {
    /** Display name of the voice */
    name: string;
    /** Language code */
    language: string;
    /** Gender of the voice */
    gender: string;
    /** Special traits or emojis associated with the voice */
    traits?: string;
    /** Target quality grade */
    targetQuality: string;
    /** Overall grade achieved */
    overallGrade: string;
}
/**
 * Collection of available voices
 */
export declare const VOICES: {
    af_heart: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_alloy: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_aoede: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_bella: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_jessica: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_kore: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_nicole: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_nova: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_river: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_sarah: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    af_sky: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_adam: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_echo: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_eric: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_fenrir: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_liam: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_michael: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_onyx: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_puck: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    am_santa: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    bf_emma: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    bf_isabella: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    bm_george: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    bm_lewis: {
        name: string;
        language: string;
        gender: string;
        targetQuality: string;
        overallGrade: string;
    };
    bf_alice: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    bf_lily: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    bm_daniel: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
    bm_fable: {
        name: string;
        language: string;
        gender: string;
        traits: string;
        targetQuality: string;
        overallGrade: string;
    };
};
/**
 * Retrieves the current voice data URL.
 *
 * @returns The current voice data URL.
 */
export declare function getVoiceDataUrl(): string;
/**
 * Sets a new voice data URL.
 *
 * @param url - The new URL to set for voice data.
 * @throws Will throw an error if the URL is not a valid non-empty string.
 */
export declare function setVoiceDataUrl(url: string): void;
/**
 * Retrieves voice data for a specific voice
 * @param voice - The voice identifier
 * @returns Promise resolving to the voice data as a Float32Array
 */
export declare function getVoiceData(voice: keyof typeof VOICES): Promise<Float32Array>;
//# sourceMappingURL=voices.d.ts.map