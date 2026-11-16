// @effect-diagnostics nodeBuiltinImport:off -- This view of a file belongs to the guard that reads every tracked file through Git.
export interface DecodedText {
  readonly offsets?: Int32Array;
  readonly origins?: Int32Array;
  readonly text: string;
}

export interface DecodeOutcome {
  readonly settled: boolean;
  readonly text: DecodedText;
}

export const MAX_DECODE_PASSES = 8;

const originOf = (input: DecodedText, index: number) =>
  input.origins?.[index] ?? index;

const rewritten = (
  input: DecodedText,
  pattern: RegExp,
  replacement: (match: string, index: number) => string
): DecodedText => {
  const parts: string[] = [];

  const origins: number[] = [];

  let cursor = 0;

  let found = false;

  for (const match of input.text.matchAll(pattern)) {
    const start = match.index ?? 0;

    const text = replacement(match[0], start);

    if (text === match[0]) {
      continue;
    }

    found = true;

    parts.push(input.text.slice(cursor, start));

    for (let index = cursor; index < start; index += 1) {
      origins.push(originOf(input, index));
    }

    parts.push(text);

    const origin = originOf(input, start);

    for (const _character of text) {
      origins.push(origin);
    }

    cursor = start + match[0].length;
  }

  if (!found) {
    return input;
  }

  parts.push(input.text.slice(cursor));

  for (let index = cursor; index < input.text.length; index += 1) {
    origins.push(originOf(input, index));
  }

  return { origins: Int32Array.from(origins), text: parts.join("") };
};

const SIMPLE_ESCAPES = new Map([
  ['"', '"'],
  ["/", "/"],
  ["\\", "\\"],
  ["b", " "],
  ["f", " "],
  ["n", "\n"],
  ["r", "\n"],
  ["t", " "],
]);

const HIGHEST_CODE_POINT = 0x10_ff_ff;

const JSON_SOURCE_ESCAPE =
  /\\u(?<hex>[0-9a-fA-F]{4})|\\(?<simple>["/\\bfnrt])/gu;

const decodeJsonEscape = (match: string) => {
  const body = match.slice(1);

  if (body.startsWith("u")) {
    const code = Number.parseInt(body.slice(1), 16);

    return Number.isFinite(code) && code > 0 && code <= HIGHEST_CODE_POINT
      ? String.fromCodePoint(code)
      : match;
  }

  return SIMPLE_ESCAPES.get(body) ?? match;
};

const HAS_JSON_ESCAPE = /\\u[0-9a-fA-F]{4}|\\["/\\bfnrt]/u;

const undoJsonEscape = (input: DecodedText) =>
  HAS_JSON_ESCAPE.test(input.text)
    ? rewritten(input, JSON_SOURCE_ESCAPE, decodeJsonEscape)
    : input;

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["colon", ":"],
  ["comma", ","],
  ["commat", "@"],
  ["dash", "-"],
  ["dollar", "$"],
  ["equals", "="],
  ["excl", "!"],
  ["gt", ">"],
  ["hyphen", "-"],
  ["lowbar", "_"],
  ["lt", "<"],
  ["nbsp", "\u00A0"],
  ["num", "#"],
  ["percnt", "%"],
  ["period", "."],
  ["plus", "+"],
  ["quot", '"'],
  ["semi", ";"],
  ["sol", "/"],
  ["verbar", "|"],
  ["vert", "|"],
]);

const HTML_ENTITY_SOURCE =
  /&(?:#(?<decimal>[0-9]{1,7})|#[xX](?<hexadecimal>[0-9a-fA-F]{1,6})|(?<named>[a-zA-Z][a-zA-Z0-9]{1,31}));/gu;

const decodeEntity = (match: string) => {
  const body = match.slice(1, -1);

  if (!body.startsWith("#")) {
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? match;
  }

  const hexadecimal = body[1] === "x" || body[1] === "X";

  const digits = hexadecimal ? body.slice(2) : body.slice(1);

  const radix = hexadecimal ? 16 : 10;

  const code = Number.parseInt(digits, radix);

  return Number.isFinite(code) && code > 0 && code <= HIGHEST_CODE_POINT
    ? String.fromCodePoint(code)
    : match;
};

const HAS_ENTITY = /&(?:#[0-9]|#[xX][0-9a-fA-F]|[a-zA-Z][a-zA-Z0-9]*;)/u;

const undoEntities = (input: DecodedText) =>
  HAS_ENTITY.test(input.text)
    ? rewritten(input, HTML_ENTITY_SOURCE, decodeEntity)
    : input;

const PERCENT_SOURCE = /(?:%[0-9a-fA-F]{2})+/gu;

const BYTES = new TextDecoder("utf-8");

const decodePercent = (match: string) => {
  const bytes: number[] = [];

  for (const part of match.matchAll(/%(?<hex>[0-9a-fA-F]{2})/gu)) {
    bytes.push(Number.parseInt(part.groups?.hex ?? "", 16));
  }

  return BYTES.decode(Uint8Array.from(bytes));
};

const HAS_PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/u;

const undoPercent = (input: DecodedText) =>
  HAS_PERCENT_ESCAPE.test(input.text)
    ? rewritten(input, PERCENT_SOURCE, decodePercent)
    : input;

const QUOTED_PRINTABLE_SOURCE = /(?:=[0-9A-Fa-f]{2})+/gu;

const SOFT_BREAK_SOURCE = /[ \t]*[=]\r?\n/gu;

const QUOTED_PRINTABLE_BYTES = /^(?:[=][0-9A-Fa-f]{2})+$/u;

const QUOTED_PRINTABLE_PIECE = /[=](?<hex>[0-9A-Fa-f]{2})/gu;

const STRICT_BYTES = new TextDecoder("utf-8", { fatal: true });

const LATIN1 = new TextDecoder("iso-8859-1");

const decodeQuotedPrintableBytes = (match: string) => {
  if (!QUOTED_PRINTABLE_BYTES.test(match)) {
    return "";
  }

  const bytes: number[] = [];

  for (const part of match.matchAll(QUOTED_PRINTABLE_PIECE)) {
    bytes.push(Number.parseInt(part.groups?.hex ?? "", 16));
  }

  try {
    return STRICT_BYTES.decode(Uint8Array.from(bytes));
  } catch {
    return LATIN1.decode(Uint8Array.from(bytes));
  }
};

const HAS_QUOTED_PRINTABLE = /[=][0-9A-Fa-f]{2}|[=]\r?\n|[ \t](?=[=]\r?\n)/u;

const undoQuotedPrintable = (input: DecodedText) =>
  HAS_QUOTED_PRINTABLE.test(input.text)
    ? rewritten(
        rewritten(input, SOFT_BREAK_SOURCE, () => ""),
        QUOTED_PRINTABLE_SOURCE,
        decodeQuotedPrintableBytes
      )
    : input;

const BASE64_RUN =
  /(?<![A-Za-z0-9+/])(?<run>[A-Za-z0-9+/_-]{13,}(?:\r?\n[A-Za-z0-9+/_-]{4,}){0,64}={0,2})(?![A-Za-z0-9+/=])/gu;

const EMPHASIS_EDGE = /^[-_]+|[-_]+$/gu;

const BASE64_ALPHABET = /^[A-Za-z0-9+/]*$/u;

const INVISIBLE = new Set([9, 10, 13]);

const readsAsPrintableBytes = (bytes: Uint8Array) => {
  for (const byte of bytes) {
    if (byte >= 0x20 && byte !== 0x7f) {
      continue;
    }

    if (!INVISIBLE.has(byte)) {
      return false;
    }
  }

  return true;
};

const WRAPPED_LINE = /[ \t\r\n]+/gu;

const decodeBase64 = (match: string) => {
  const candidates = [match, match.replaceAll(EMPHASIS_EDGE, "")].map((value) =>
    value.replaceAll(WRAPPED_LINE, "")
  );

  for (const candidate of candidates) {
    if (candidate.length < 16) {
      continue;
    }

    const normalized = candidate.replaceAll("-", "+").replaceAll("_", "/");

    const body = normalized.replaceAll(/[=]+$/gu, "");

    if (body.length % 4 === 1 || !BASE64_ALPHABET.test(body)) {
      continue;
    }

    const padded = body.padEnd(
      body.length + ((4 - (body.length % 4)) % 4),
      "="
    );

    const bytes = Buffer.from(padded, "base64");

    if (bytes.toString("base64") !== padded || bytes.length === 0) {
      continue;
    }

    if (!readsAsPrintableBytes(bytes)) {
      continue;
    }

    try {
      return STRICT_BYTES.decode(bytes);
    } catch {
      continue;
    }
  }

  return match;
};

const READS_AS_BASE64 = /[g-zG-Z]/u;

const HAS_BASE64_RUN =
  /(?<![A-Za-z0-9+/])[A-Za-z0-9+/_-]{13,}={0,2}(?![A-Za-z0-9+/=])/u;

const undoBase64 = (input: DecodedText) =>
  HAS_BASE64_RUN.test(input.text)
    ? rewritten(input, BASE64_RUN, (match) =>
        READS_AS_BASE64.test(match) ? decodeBase64(match) : match
      )
    : input;

const PLUS_SOURCE = /\+/gu;

const readsAsLocalPart = (text: string, index: number) => {
  let start = index;

  while (start > 0 && !/\s/u.test(text[start - 1] ?? "")) {
    start -= 1;
  }

  let end = index;

  while (end < text.length && !/\s/u.test(text[end] ?? "")) {
    end += 1;
  }

  const token = text.slice(start, end);

  const at = token.indexOf("@");

  return at > index - start;
};

const undoFormPlus = (input: DecodedText) =>
  input.text.includes("+")
    ? rewritten(input, PLUS_SOURCE, (_match, index) =>
        readsAsLocalPart(input.text, index) ? "+" : " "
      )
    : input;

const TAG_SOURCE = /<[A-Za-z/!](?:"[^"]*"|'[^']*'|[^<>"'])*>/gsu;

const HAS_TAG = /<[A-Za-z/!]/u;

const undoTag = (input: DecodedText) =>
  HAS_TAG.test(input.text) ? rewritten(input, TAG_SOURCE, () => "") : input;

const HAS_ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/u;

const ZERO_WIDTH_SOURCE = /[\u200B-\u200D\u2060\uFEFF]/gu;

const undoZeroWidth = (input: DecodedText) =>
  HAS_ZERO_WIDTH.test(input.text)
    ? rewritten(input, ZERO_WIDTH_SOURCE, () => "")
    : input;

const HAS_NON_ASCII = /[^\p{ASCII}]/u;

const NON_ASCII_SOURCE = /[^\p{ASCII}]/gu;

const foldWidth = (match: string) => match.normalize("NFKC");

const undoFold = (input: DecodedText) =>
  HAS_NON_ASCII.test(input.text)
    ? rewritten(input, NON_ASCII_SOURCE, foldWidth)
    : input;

type Step = (input: DecodedText) => DecodedText;

const UNDO_STEPS: readonly Step[] = [
  undoZeroWidth,
  undoFold,
  undoJsonEscape,
  undoEntities,
  undoPercent,
  undoQuotedPrintable,
  undoZeroWidth,
  undoFold,
  undoBase64,
  undoFormPlus,
  undoTag,
];

const READABLE_STEPS: readonly Step[] = UNDO_STEPS.filter(
  (step) => step !== undoTag && step !== undoQuotedPrintable
);

const UNTAGGED_STEPS: readonly Step[] = UNDO_STEPS.filter(
  (step) => step !== undoQuotedPrintable
);

const undoEverything = (steps: readonly Step[], input: DecodedText) => {
  let current = input;

  for (const step of steps) {
    current = step(current);
  }

  return current;
};

const CAN_CHANGE =
  /[&%+\\<=>\u0080-\uFFFF]|(?<![A-Za-z0-9+/])[A-Za-z0-9+/_-]{13,}={0,2}/u;

const settle = (input: DecodedText, steps: readonly Step[]): DecodeOutcome => {
  let current = input;

  let settled = false;

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (!CAN_CHANGE.test(current.text)) {
      settled = true;

      break;
    }

    const next = undoEverything(steps, current);

    if (next.text === current.text) {
      settled = true;

      break;
    }

    current = next;
  }

  return { settled, text: current };
};

export const decodeText = (text: string): DecodeOutcome =>
  settle(undoQuotedPrintable({ text }), UNTAGGED_STEPS);

export const hasQuotedPrintable = (text: string) =>
  HAS_QUOTED_PRINTABLE.test(text);

export const decodeTaggedText = (text: string): DecodeOutcome => {
  const plain = settle({ text }, READABLE_STEPS);

  const quoted = undoQuotedPrintable(plain.text);

  return quoted.text === plain.text.text ? plain : settle(quoted, READABLE_STEPS);
};

export const decodeUnquotedText = (text: string): DecodeOutcome =>
  settle({ text }, READABLE_STEPS);

export const quotePrintable = (input: DecodedText): DecodedText =>
  undoQuotedPrintable(input);

export const removeTagMarkup = (input: DecodedText): DecodedText =>
  undoTag(input);

export const continueDecoding = (input: DecodedText): DecodeOutcome =>
  settle(input, READABLE_STEPS);

const DIGIT_SOURCE = /[0-9]/u;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const squeezeSlow = (input: DecodedText): DecodedText => {
  const characters: string[] = [];

  const origins: number[] = [];

  const offsets: number[] = [];

  let position = 0;

  for (const character of input.text) {
    const start = position;

    position += character.length;

    for (const lowered of character.toLowerCase()) {
      if (!LETTER_OR_DIGIT.test(lowered)) {
        continue;
      }

      characters.push(lowered);

      origins.push(originOf(input, start));

      offsets.push(start);
    }
  }

  return {
    offsets: Int32Array.from(offsets),
    origins: Int32Array.from(origins),
    text: characters.join(""),
  };
};

const squeezeAscii = (input: DecodedText): DecodedText => {
  const characters: string[] = [];

  const origins: number[] = [];

  const offsets: number[] = [];

  const { text } = input;

  for (let position = 0; position < text.length; position += 1) {
    const code = text.codePointAt(position) ?? 0;

    if (code >= 48 && code <= 57) {
      characters.push(text[position] ?? "");

      origins.push(originOf(input, position));

      offsets.push(position);

      continue;
    }

    if (code >= 65 && code <= 90) {
      characters.push(String.fromCodePoint(code + 32));

      origins.push(originOf(input, position));

      offsets.push(position);

      continue;
    }

    if (code >= 97 && code <= 122) {
      characters.push(text[position] ?? "");

      origins.push(originOf(input, position));

      offsets.push(position);
    }
  }

  return {
    offsets: Int32Array.from(offsets),
    origins: Int32Array.from(origins),
    text: characters.join(""),
  };
};

const EMPTY_SQUEEZED: DecodedText = {
  offsets: new Int32Array(0),
  origins: new Int32Array(0),
  text: "",
};

export const squeezeText = (input: DecodedText): DecodedText => {
  if (!DIGIT_SOURCE.test(input.text)) {
    return EMPTY_SQUEEZED;
  }

  return HAS_NON_ASCII.test(input.text)
    ? squeezeSlow(input)
    : squeezeAscii(input);
};
