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
  /(?<![A-Za-z0-9+/])(?<run>[A-Za-z0-9+/_-]{13,}(?:\r?\n[A-Za-z0-9+/_-]{4,}){0,64}(?:\r?\n[A-Za-z0-9+/_-]{1,3})?={0,2})(?![A-Za-z0-9+/=])/gu;

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

const LINE_SPLIT = /[\r\n]+/u;

const truncations = (value: string): readonly string[] => {
  const parts = value.split(LINE_SPLIT);

  const candidates: string[] = [];

  for (let count = parts.length; count > 0; count -= 1) {
    candidates.push(parts.slice(0, count).join(""));
  }

  return candidates;
};

const base64Bytes = (value: string): Uint8Array | undefined => {
  if (value.length < 16) {
    return undefined;
  }

  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");

  const body = normalized.replaceAll(/[=]+$/gu, "");

  if (body.length % 4 === 1 || !BASE64_ALPHABET.test(body)) {
    return undefined;
  }

  const padded = body.padEnd(body.length + ((4 - (body.length % 4)) % 4), "=");

  const bytes = Buffer.from(padded, "base64");

  if (bytes.toString("base64") !== padded || bytes.length === 0) {
    return undefined;
  }

  return readsAsPrintableBytes(bytes) ? bytes : undefined;
};

const readStrict = (bytes: Uint8Array): string | undefined => {
  try {
    return STRICT_BYTES.decode(bytes);
  } catch {
    return undefined;
  }
};

const attemptsOf = (match: string): readonly string[] =>
  [match, match.replaceAll(EMPHASIS_EDGE, "")].flatMap((value) =>
    truncations(value).map((candidate) =>
      candidate.replaceAll(WRAPPED_LINE, "")
    )
  );

const decodeBase64 = (match: string) => {
  const attempts = attemptsOf(match);

  for (const attempt of attempts) {
    const bytes = base64Bytes(attempt);

    if (bytes === undefined) {
      continue;
    }

    const text = readStrict(bytes);

    if (text !== undefined) {
      return text;
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

const LINE_BREAK = /\r\n|\r|\n/gu;

const WRAPPED_CONTAINER = "[ \\t]*(?:>>?|#|\\/\\/|\\||\\*|-)?[ \\t]*";

const CONTAINER_HEAD = "[ \\t]*(?:>>?|#|\\/\\/|\\||\\*|-)[ \\t]*";

const LINE_BREAK_SOURCE = "(?:\\r\\n|\\r|\\n)";

const JOIN_HINT = new RegExp(
  [
    `\\S=[ \\t]*${LINE_BREAK_SOURCE}[ \\t]*\\S`,
    `(?:^|${LINE_BREAK_SOURCE})${WRAPPED_CONTAINER}[A-Za-z0-9+/_-]{8,}={0,2}[ \\t]*${LINE_BREAK_SOURCE}${WRAPPED_CONTAINER}[A-Za-z0-9+/_-]+`,
    `(?:^|${LINE_BREAK_SOURCE})${CONTAINER_HEAD}[^\\r\\n]*(?:%[0-9A-Fa-f]{2}|&#[0-9]|\\\\u[0-9A-Fa-f]{4}|=[0-9A-Fa-f]{2})`,
    `[A-Za-z0-9+/_-]{24,}={0,2}[ \\t]*${LINE_BREAK_SOURCE}[ \\t]*(?:[>#|*/\\-]+[ \\t]*)?[A-Za-z0-9+/_-]+`,
  ].join("|"),
  "u"
);

const LEADING_SPACE = /^[ \t]*/u;

const CONTAINER_PREFIX =
  /^(?:>>[ \t]*|>[ \t]*|\/\/[ \t]*|#[ \t]*|\|[ \t]*|\*[ \t]+|-[ \t]+)/u;

const QUOTE_EDGE = new Set(['"', "'"]);

const TRAILING_SPACE = /[ \t]+$/u;

interface LineBounds {
  readonly end: number;
  readonly start: number;
}

const contentBounds = (line: string): LineBounds => {
  let start = LEADING_SPACE.exec(line)?.[0].length ?? 0;

  start += CONTAINER_PREFIX.exec(line.slice(start))?.[0].length ?? 0;

  if (QUOTE_EDGE.has(line[start] ?? "")) {
    start += 1;
  }

  let end = line.length - (TRAILING_SPACE.exec(line)?.[0].length ?? 0);

  if (end > start && QUOTE_EDGE.has(line[end - 1] ?? "")) {
    end -= 1;
  }

  return { end, start };
};

const stripContainers = (text: string): DecodedText | undefined => {
  if (!JOIN_HINT.test(text)) {
    return undefined;
  }

  const parts: string[] = [];

  const origins: number[] = [];

  let position = 0;

  for (;;) {
    LINE_BREAK.lastIndex = position;

    const lineBreak = LINE_BREAK.exec(text);

    const lineEnd = lineBreak?.index ?? text.length;

    const line = text.slice(position, lineEnd);

    const { end, start } = contentBounds(line);

    const content = line.slice(start, end);

    parts.push(content);

    for (let index = 0; index < content.length; index += 1) {
      origins.push(position + start + index);
    }

    if (lineBreak === null) {
      break;
    }

    parts.push("\n");

    origins.push(lineBreak.index + lineBreak[0].length - 1);

    position = lineBreak.index + lineBreak[0].length;
  }

  return { origins: Int32Array.from(origins), text: parts.join("") };
};

interface Decoder {
  readonly id: string;
  readonly readable: boolean;
  readonly step: Step;
}

export const DECODERS: readonly Decoder[] = [
  { id: "zero-width", readable: true, step: undoZeroWidth },
  { id: "fold", readable: true, step: undoFold },
  { id: "json-escape", readable: true, step: undoJsonEscape },
  { id: "entity", readable: true, step: undoEntities },
  { id: "percent", readable: true, step: undoPercent },
  { id: "quoted-printable", readable: false, step: undoQuotedPrintable },
  { id: "base64", readable: true, step: undoBase64 },
  { id: "form-plus", readable: true, step: undoFormPlus },
  { id: "tag", readable: false, step: undoTag },
];

const DECODER_ORDER = [
  "zero-width",
  "fold",
  "json-escape",
  "entity",
  "percent",
  "quoted-printable",
  "zero-width",
  "fold",
  "base64",
  "form-plus",
  "tag",
] as const;

const BY_ID = new Map(DECODERS.map((decoder) => [decoder.id, decoder]));

const ORDERED: readonly Decoder[] = DECODER_ORDER.map((id) => {
  const decoder = BY_ID.get(id);

  if (decoder === undefined) {
    throw new Error(`no decoder named ${id}`);
  }

  return decoder;
});

const READABLE_STEPS: readonly Decoder[] = ORDERED.filter(
  (decoder) => decoder.readable
);

const UNTAGGED_STEPS: readonly Decoder[] = ORDERED.filter(
  (decoder) => decoder.id !== "quoted-printable"
);

type Recorder = (id: string) => void;

const decoderNamed = (id: string): Decoder => {
  const decoder = BY_ID.get(id);

  if (decoder === undefined) {
    throw new Error(`no decoder named ${id}`);
  }

  return decoder;
};

const runDecoder = (
  decoder: Decoder,
  input: DecodedText,
  record?: Recorder
) => {
  record?.(decoder.id);

  return decoder.step(input);
};

const undoEverything = (
  steps: readonly Decoder[],
  input: DecodedText,
  record?: Recorder
) => {
  let current = input;

  for (const step of steps) {
    current = runDecoder(step, current, record);
  }

  return current;
};

const CAN_CHANGE =
  /[&%+\\<=>\u0080-\uFFFF]|(?<![A-Za-z0-9+/])[A-Za-z0-9+/_-]{13,}={0,2}/u;

const settle = (
  input: DecodedText,
  steps: readonly Decoder[],
  record?: Recorder
): DecodeOutcome => {
  let current = input;

  let settled = false;

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (!CAN_CHANGE.test(current.text)) {
      settled = true;

      break;
    }

    const next = undoEverything(steps, current, record);

    if (next.text === current.text) {
      settled = true;

      break;
    }

    current = next;
  }

  return { settled, text: current };
};

export const decodeText = (text: string): DecodeOutcome =>
  settle(
    runDecoder(decoderNamed("quoted-printable"), { text }),
    UNTAGGED_STEPS
  );

export const hasQuotedPrintable = (text: string) =>
  HAS_QUOTED_PRINTABLE.test(text);

export const decodeTaggedText = (text: string): DecodeOutcome => {
  const plain = settle({ text }, READABLE_STEPS);

  const quoted = undoQuotedPrintable(plain.text);

  return quoted.text === plain.text.text
    ? plain
    : settle(quoted, READABLE_STEPS);
};

export const decodeUnquotedText = (text: string): DecodeOutcome =>
  settle({ text }, READABLE_STEPS);

export const quotePrintable = (input: DecodedText): DecodedText =>
  undoQuotedPrintable(input);

export const removeTagMarkup = (input: DecodedText): DecodedText =>
  undoTag(input);

export const continueDecoding = (input: DecodedText): DecodeOutcome =>
  settle(input, READABLE_STEPS);

export interface DecodeChain {
  readonly readable: DecodeOutcome;
  readonly settled: boolean;
  readonly unquoted: DecodeOutcome;
  readonly unwrapped: DecodeOutcome;
}

export interface StrippedChain {
  readonly settled: boolean;
  readonly text: DecodedText;
  readonly view: string;
}

export interface DecodeChains {
  readonly asWritten: DecodeChain;
  readonly ranOn: {
    readonly stripped: readonly string[];
    readonly written: readonly string[];
  };
  readonly stripped: StrippedChain | undefined;
}

const chainFrom = (start: DecodedText, record?: Recorder): DecodeChain => {
  const unquoted = settle(start, READABLE_STEPS, record);

  const quoted = runDecoder(
    decoderNamed("quoted-printable"),
    unquoted.text,
    record
  );

  const readable =
    quoted.text === unquoted.text.text
      ? unquoted
      : settle(quoted, READABLE_STEPS, record);

  const untagged = runDecoder(decoderNamed("tag"), readable.text, record);

  const unwrapped = settle(untagged, READABLE_STEPS, record);

  return {
    readable,
    settled: unquoted.settled && readable.settled && unwrapped.settled,
    unquoted,
    unwrapped,
  };
};

export const decodeChains = (text: string): DecodeChains => {
  const written = new Set<string>();

  const stripped = new Set<string>();

  const asWritten = chainFrom({ text }, (id) => {
    written.add(id);
  });

  const containerView = stripContainers(text);

  if (containerView === undefined) {
    return {
      asWritten,
      ranOn: { stripped: [], written: [...written] },
      stripped: undefined,
    };
  }

  const chain = chainFrom(containerView, (id) => {
    stripped.add(id);
  });

  return {
    asWritten,
    ranOn: { stripped: [...stripped], written: [...written] },
    stripped: {
      settled: chain.settled,
      text: chain.unwrapped.text,
      view: containerView.text,
    },
  };
};

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
