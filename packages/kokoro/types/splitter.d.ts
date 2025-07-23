/**
 * A simple stream-based text splitter that emits complete sentences.
 */
export declare class TextSplitterStream {
    private _buffer;
    private _sentences;
    private _resolver;
    private _closed;
    constructor();
    /**
     * Push one or more text chunks into the stream.
     * @param texts - Text fragments to process.
     */
    push(...texts: string[]): void;
    /**
     * Closes the stream, signaling that no more text will be pushed.
     * This will flush any remaining text in the buffer as a sentence
     * and allow the consuming process to finish processing the stream.
     */
    close(): void;
    /**
     * Flushes any remaining text in the buffer as a sentence.
     */
    flush(): void;
    /**
     * Resolve the pending promise to signal that sentences are available.
     * @private
     */
    private _resolve;
    /**
     * Processes the internal buffer to extract complete sentences.
     * If the potential sentence boundary is at the end of the current buffer,
     * it waits for more text before splitting.
     * @private
     */
    private _process;
    /**
     * Async iterator to yield sentences as they become available.
     * @returns Async generator yielding sentences.
     */
    [Symbol.asyncIterator](): AsyncGenerator<string, void, void>;
    /**
     * Synchronous iterator that flushes the buffer and returns all sentences.
     * @returns Iterator yielding sentences.
     */
    [Symbol.iterator](): Iterator<string>;
    /**
     * Returns the array of sentences currently available.
     */
    get sentences(): string[];
}
/**
 * Splits the input text into an array of sentences.
 * @param text - The text to split.
 * @returns An array of sentences.
 */
export declare function split(text: string): string[];
//# sourceMappingURL=splitter.d.ts.map