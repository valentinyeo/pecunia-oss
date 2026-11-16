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

const undoJsonEscape = (input: DecodedText) =>
  rewritten(input, JSON_SOURCE_ESCAPE, decodeJsonEscape);

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

const undoEntities = (input: DecodedText) =>
  rewritten(input, HTML_ENTITY_SOURCE, decodeEntity);

const PERCENT_SOURCE = /(?:%[0-9a-fA-F]{2})+/gu;

const BYTES = new TextDecoder("utf-8");

const decodePercent = (match: string) => {
  const bytes: number[] = [];

  for (const part of match.matchAll(/%(?<hex>[0-9a-fA-F]{2})/gu)) {
    bytes.push(Number.parseInt(part.groups?.hex ?? "", 16));
  }

  return BYTES.decode(Uint8Array.from(bytes));
};

const undoPercent = (input: DecodedText) =>
  rewritten(input, PERCENT_SOURCE, decodePercent);

const QUOTED_PRINTABLE_SOURCE = /(?:[=][0-9a-fA-F]{2})+/gu;

const STRICT_BYTES = new TextDecoder("utf-8", { fatal: true });

const QUOTED_PRINTABLE_PIECE = /[=](?<hex>[0-9a-fA-F]{2})/gu;

const QUOTED_PRINTABLE_TEXT = /^(?:[@.,:;=+\-_/]|[^\p{ASCII}])*$/u;

const decodeQuotedPrintableEscape = (match: string) => {
  const bytes: number[] = [];

  for (const part of match.matchAll(QUOTED_PRINTABLE_PIECE)) {
    bytes.push(Number.parseInt(part.groups?.hex ?? "", 16));
  }

  try {
    const decoded = STRICT_BYTES.decode(Uint8Array.from(bytes));

    return decoded.length > 0 && QUOTED_PRINTABLE_TEXT.test(decoded)
      ? decoded
      : match;
  } catch {
    return match;
  }
};

const undoQuotedPrintable = (input: DecodedText) =>
  rewritten(input, QUOTED_PRINTABLE_SOURCE, decodeQuotedPrintableEscape);

const BASE64_RUN =
  /(?<![A-Za-z0-9+/])(?<run>[A-Za-z0-9+/_-]{13,}={0,2})(?![A-Za-z0-9+/=])/gu;

const EMPHASIS_EDGE = /^[-_]+|[-_]+$/gu;

const BASE64_ALPHABET = /^[A-Za-z0-9+/]*$/u;

const INVISIBLE = /[\t\n\r]/gu;

const CONTROL = /[\p{Cc}]/u;

const readsAsPrintable = (text: string) =>
  !CONTROL.test(text.replaceAll(INVISIBLE, ""));

const decodeBase64 = (match: string) => {
  const candidates = [match, match.replaceAll(EMPHASIS_EDGE, "")];

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

    try {
      const decoded = STRICT_BYTES.decode(bytes);

      if (readsAsPrintable(decoded)) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return match;
};

const undoBase64 = (input: DecodedText) =>
  rewritten(input, BASE64_RUN, decodeBase64);

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
  rewritten(input, PLUS_SOURCE, (_match, index) =>
    readsAsLocalPart(input.text, index) ? "+" : " "
  );

const TAG_SOURCE = /<[A-Za-z/!](?:"[^"]*"|'[^']*'|[^<>"'])*>/gsu;

const undoTag = (input: DecodedText) => rewritten(input, TAG_SOURCE, () => "");

const ZERO_WIDTH_SOURCE = /[\u200B-\u200D\u2060\uFEFF]/gu;

const undoZeroWidth = (input: DecodedText) =>
  rewritten(input, ZERO_WIDTH_SOURCE, () => "");

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
  (step) => step !== undoTag
);

const undoEverything = (steps: readonly Step[], input: DecodedText) => {
  let current = input;

  for (const step of steps) {
    current = step(current);
  }

  return current;
};

const CAN_CHANGE =
  /[&%+\\<=>\u0080-\uFFFF]|(?<![A-Za-z0-9+/])[CDI-Za-fw-z0-9][A-Za-z0-9+/_-]{13,}={0,2}/u;

const settle = (text: string, steps: readonly Step[]): DecodeOutcome => {
  let current: DecodedText = { text };

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
  settle(text, UNDO_STEPS);

export const decodeTaggedText = (text: string): DecodeOutcome =>
  settle(text, READABLE_STEPS);

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export const squeezeText = (input: DecodedText): DecodedText => {
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
