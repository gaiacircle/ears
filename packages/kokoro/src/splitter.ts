/**
 * Returns true if the character is considered a sentence terminator.
 * This includes ASCII (".", "!", "?") and common Unicode terminators.
 * NOTE: We also include newlines here, as this is favourable for text-to-speech systems.
 * @param c - The character to test.
 * @param includeNewlines - Whether to treat newlines as terminators.
 * @returns True if the character is a sentence terminator.
 */
function isSentenceTerminator(c: string, includeNewlines: boolean = true): boolean {
  return ".!?…。？！".includes(c) || (includeNewlines && c === "\n");
}

/**
 * Returns true if the character should be attached to the sentence terminator,
 * such as closing quotes or brackets.
 * @param c - The character to test.
 * @returns True if the character is a trailing character.
 */
function isTrailingChar(c: string): boolean {
  return "\"')]}」』".includes(c);
}

/**
 * Extracts a token (a contiguous sequence of non–whitespace characters)
 * from the buffer starting at the given index.
 * @param buffer - The input text.
 * @param start - The starting index.
 * @returns The extracted token.
 */
function getTokenFromBuffer(buffer: string, start: number): string {
  let end = start;
  while (end < buffer.length && !/\s/.test(buffer[end])) {
    ++end;
  }
  return buffer.substring(start, end);
}

// List of common abbreviations. Note that strings with single letters joined by periods
// (e.g., "i.e", "e.g", "u.s.a", "u.s") are handled separately.
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "prof", "sr", "jr", "sgt", "col", "gen", "rep", "sen", "gov", "lt", "maj", "capt", "st", "mt", "etc", "co", "inc", "ltd", "dept", "vs", "p", "pg", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "sun", "mon", "tu", "tue", "tues", "wed", "th", "thu", "thur", "thurs", "fri", "sat"]);

/**
 * Determines if the given token (or series of initials) is a known abbreviation.
 * @param token - The token to check.
 * @returns True if the token is an abbreviation.
 */
function isAbbreviation(token: string): boolean {
  // Remove possessive endings and trailing periods.
  token = token.replace(/['’]s$/i, "").replace(/\.+$/, "");
  return ABBREVIATIONS.has(token.toLowerCase());
}

// Map of closing punctuation to their corresponding opening punctuation.
const MATCHING = new Map([
  [")", "("],
  ["]", "["],
  ["]", "["],
  ["}", "{"],
  ["》", "《"],
  ["〉", "〈"],
  ["›", "‹"],
  ["»", "«"],
  ["〉", "〈"],
  ["」", "「"],
  ["』", "『"],
  ["〕", "〔"],
  ["】", "【"],
]);

// Set of opening punctuation characters.
const OPENING = new Set(MATCHING.values());

/**
 * Updates the nesting stack to track quotes and paired punctuation.
 * This supports both standard (", ', (), [], {}) and Japanese quotes (「」「』『』).
 * (An apostrophe between letters is ignored so that contractions remain intact.)
 * @param c - The current character.
 * @param stack - The current nesting stack.
 * @param i - The index of the character in the buffer.
 * @param buffer - The full text being processed.
 */
function updateStack(c: string, stack: string[], i: number, buffer: string): void {
  // Handle standard quotes.
  if (c === '"' || c === "'") {
    // Ignore an apostrophe if it's between letters (e.g., in contractions).
    if (c === "'" && i > 0 && i < buffer.length - 1 && /[A-Za-z]/.test(buffer[i - 1]) && /[A-Za-z]/.test(buffer[i + 1])) {
      return;
    }
    if (stack.length && stack.at(-1) === c) {
      stack.pop();
    } else {
      stack.push(c);
    }
    return;
  }
  // Handle opening punctuation.
  if (OPENING.has(c)) {
    stack.push(c);
    return;
  }
  // Handle closing punctuation.
  const expectedOpening = MATCHING.get(c);
  if (expectedOpening && stack.length && stack.at(-1) === expectedOpening) {
    stack.pop();
  }
}

/**
 * Result of scanning a sentence boundary
 */
interface BoundaryScanResult {
  /** The end index of the boundary */
  end: number;
  /** The index of the next non-whitespace character */
  nextNonSpace: number;
}

/**
 * A simple stream-based text splitter that emits complete sentences.
 */
export class TextSplitterStream {
  private _buffer: string;
  private _sentences: string[];
  private _resolver: (() => void) | null;
  private _closed: boolean;

  constructor() {
    this._buffer = "";
    this._sentences = [];
    this._resolver = null;
    this._closed = false;
  }

  /**
   * Push one or more text chunks into the stream.
   * @param texts - Text fragments to process.
   */
  push(...texts: string[]): void {
    for (const txt of texts) {
      this._buffer += txt;
      this._process();
    }
  }

  /**
   * Closes the stream, signaling that no more text will be pushed.
   * This will flush any remaining text in the buffer as a sentence
   * and allow the consuming process to finish processing the stream.
   */
  close(): void {
    if (this._closed) {
      throw new Error("Stream is already closed.");
    }
    this._closed = true;
    this.flush();
  }

  /**
   * Flushes any remaining text in the buffer as a sentence.
   */
  flush(): void {
    const remainder = this._buffer.trim();
    if (remainder.length > 0) {
      this._sentences.push(remainder);
    }
    this._buffer = "";
    this._resolve();
  }

  /**
   * Resolve the pending promise to signal that sentences are available.
   * @private
   */
  private _resolve(): void {
    if (this._resolver) {
      this._resolver();
      this._resolver = null;
    }
  }

  /**
   * Processes the internal buffer to extract complete sentences.
   * If the potential sentence boundary is at the end of the current buffer,
   * it waits for more text before splitting.
   * @private
   */
  private _process(): void {
    let sentenceStart = 0;
    const buffer = this._buffer;
    const len = buffer.length;
    let i = 0;
    let stack: string[] = [];

    // Helper to scan from the current index over trailing terminators and punctuation.
    const scanBoundary = (idx: number): BoundaryScanResult => {
      let end = idx;
      // Consume contiguous sentence terminators (excluding newlines).
      while (end + 1 < len && isSentenceTerminator(buffer[end + 1], false)) {
        ++end;
      }
      // Consume trailing characters (e.g., closing quotes/brackets).
      while (end + 1 < len && isTrailingChar(buffer[end + 1])) {
        ++end;
      }
      let nextNonSpace = end + 1;
      while (nextNonSpace < len && /\s/.test(buffer[nextNonSpace])) {
        ++nextNonSpace;
      }
      return { end, nextNonSpace };
    };

    while (i < len) {
      const c = buffer[i];
      updateStack(c, stack, i, buffer);

      // Only consider splitting if we're not inside any nested structure.
      if (stack.length === 0 && isSentenceTerminator(c)) {
        const currentSegment = buffer.slice(sentenceStart, i);
        // Skip splitting for likely numbered lists (e.g., "1." or "\n2.").
        if (/(^|\n)\d+$/.test(currentSegment)) {
          ++i;
          continue;
        }

        const { end: boundaryEnd, nextNonSpace } = scanBoundary(i);

        // If the terminator is not a newline and there's no extra whitespace,
        // we might be in the middle of a token (e.g., "$9.99"), so skip splitting.
        if (i === nextNonSpace - 1 && c !== "\n") {
          ++i;
          continue;
        }

        // Wait for more text if there's no non-whitespace character yet.
        if (nextNonSpace === len) {
          break;
        }

        // Determine the token immediately preceding the terminator.
        let tokenStart = i - 1;
        while (tokenStart >= 0 && /\S/.test(buffer[tokenStart])) {
          tokenStart--;
        }
        tokenStart = Math.max(sentenceStart, tokenStart + 1);
        const token = getTokenFromBuffer(buffer, tokenStart);
        if (!token) {
          ++i;
          continue;
        }

        // --- URL/email protection ---
        // If the token appears to be a URL or email (contains "://" or "@")
        // and does not already end with a terminator, skip splitting.
        if ((/https?[,:]\/\//.test(token) || token.includes("@")) && !isSentenceTerminator(token.at(-1)!)) {
          i = tokenStart + token.length;
          continue;
        }

        // --- Abbreviation protection ---
        if (isAbbreviation(token)) {
          ++i;
          continue;
        }

        // --- Middle initials heuristic ---
        // If the token is a series of single-letter initials (each ending in a period)
        // and is followed by a capitalized word, assume it's part of a name.
        if (/^([A-Za-z]\.)+$/.test(token) && nextNonSpace < len && /[A-Z]/.test(buffer[nextNonSpace])) {
          ++i;
          continue;
        }

        // --- Lookahead heuristic ---
        // If the terminator is a period and the next non–whitespace character is lowercase,
        // assume it is not the end of a sentence.
        if (c === "." && nextNonSpace < len && /[a-z]/.test(buffer[nextNonSpace])) {
          ++i;
          continue;
        }

        // Special case: ellipsis that stands alone should be merged with the following sentence.
        const sentence = buffer.substring(sentenceStart, boundaryEnd + 1).trim();
        if (sentence === "..." || sentence === "…") {
          ++i;
          continue;
        }

        // Accept the sentence boundary.
        if (sentence) {
          this._sentences.push(sentence);
        }
        // Move to the next sentence.
        i = sentenceStart = boundaryEnd + 1;
        continue;
      }
      ++i;
    }

    // Remove the processed portion of the buffer.
    this._buffer = buffer.substring(sentenceStart);

    // Resolve any pending promise if sentences are available.
    if (this._sentences.length > 0) {
      this._resolve();
    }
  }

  /**
   * Async iterator to yield sentences as they become available.
   * @returns Async generator yielding sentences.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<string, void, void> {
    if (this._resolver) {
      throw new Error("Another iterator is already active.");
    }
    while (true) {
      if (this._sentences.length > 0) {
        yield this._sentences.shift()!;
      } else if (this._closed) {
        // No more text will be pushed.
        break;
      } else {
        // Wait for more text.
        await new Promise<void>((resolve) => {
          this._resolver = resolve;
        });
      }
    }
  }

  /**
   * Synchronous iterator that flushes the buffer and returns all sentences.
   * @returns Iterator yielding sentences.
   */
  [Symbol.iterator](): Iterator<string> {
    this.flush();
    const iterator = this._sentences[Symbol.iterator]();
    this._sentences = [];
    return iterator;
  }

  /**
   * Returns the array of sentences currently available.
   */
  get sentences(): string[] {
    return this._sentences;
  }
}

/**
 * Splits the input text into an array of sentences.
 * @param text - The text to split.
 * @returns An array of sentences.
 */
export function split(text: string): string[] {
  const splitter = new TextSplitterStream();
  splitter.push(text);
  return [...splitter];
}