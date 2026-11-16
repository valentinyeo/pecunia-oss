// @effect-diagnostics nodeBuiltinImport:off -- This view of a file belongs to the guard that reads every tracked file through Git.
export interface DecodedText {
  readonly origins?: Int32Array;
  readonly text: string;
}

export type DecoderId =
  | "json-string"
  | "html-entity"
  | "tag"
  | "percent"
  | "separator";

export interface Decoder {
  readonly decode: (input: DecodedText) => DecodedText;
  readonly id: DecoderId;
}

const TABLE_SIZE = 65_536;

const escapedCode = (code: number) =>
  `\\u${code.toString(16).padStart(4, "0")}`;

const classOf = (ranges: readonly (readonly [number, number])[]) =>
  ranges
    .map(([low, high]) =>
      low === high
        ? escapedCode(low)
        : `${escapedCode(low)}-${escapedCode(high)}`
    )
    .join("");

const tableOf = (ranges: readonly (readonly [number, number])[]) => {
  const table = new Uint8Array(TABLE_SIZE);

  for (const [low, high] of ranges) {
    for (let code = low; code <= high; code += 1) {
      table[code] = 1;
    }
  }

  return table;
};

export const SEPARATOR_RANGES: readonly (readonly [number, number])[] = [
  [0x09, 0x09],
  [0x0b, 0x0c],
  [0x20, 0x20],
  [0x2d, 0x2d],
  [0x2e, 0x2e],
  [0xa0, 0xa0],
  [0x16_80, 0x16_80],
  [0x20_00, 0x20_0a],
  [0x20_10, 0x20_15],
  [0x20_2f, 0x20_2f],
  [0x20_5f, 0x20_5f],
  [0x30_00, 0x30_00],
  [0xfe_ff, 0xfe_ff],
];

const FOLDED_RANGES: readonly (readonly [number, number])[] = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0x2c, 0x2c],
  [0x3a, 0x3a],
  [0x3d, 0x3d],
  [0x85, 0x85],
  [0xa0, 0xa0],
  [0x16_80, 0x16_80],
  [0x20_00, 0x20_0d],
  [0x20_28, 0x20_29],
  [0x20_2f, 0x20_2f],
  [0x20_5f, 0x20_5f],
  [0x30_00, 0x30_00],
  [0xfe_ff, 0xfe_ff],
  [0xff_0c, 0xff_0c],
  [0xff_1a, 0xff_1a],
  [0xff_1d, 0xff_1d],
];

const STRIPPED_RANGES: readonly (readonly [number, number])[] = [
  [0x22, 0x22],
  [0x27, 0x27],
  [0x60, 0x60],
  [0xab, 0xab],
  [0xb4, 0xb4],
  [0xbb, 0xbb],
  [0x20_18, 0x20_1f],
];

export const SEPARATOR_CLASS = classOf(SEPARATOR_RANGES);

export const SEPARATOR_CODE = tableOf(SEPARATOR_RANGES);

const FOLDED_CODE = tableOf(FOLDED_RANGES);

const STRIPPED_CODE = tableOf(STRIPPED_RANGES);

export const SEPARATOR_RUN = new RegExp(`[${SEPARATOR_CLASS}]+`, "gu");

export const SEPARATOR_EDGES = new RegExp(
  `^[${SEPARATOR_CLASS}]+|[${SEPARATOR_CLASS}]+$`,
  "gu"
);

const originOf = (input: DecodedText, index: number) =>
  input.origins?.[index] ?? index;

const rewritten = (
  input: DecodedText,
  pattern: RegExp,
  replacement: (match: string) => string
): DecodedText => {
  const parts: string[] = [];

  const origins: number[] = [];

  let cursor = 0;

  let found = false;

  for (const match of input.text.matchAll(pattern)) {
    const start = match.index ?? 0;

    const text = replacement(match[0]);

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
  ["n", " "],
  ["r", " "],
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

const JSON_STRING_DECODER: Decoder = {
  decode: (input) => rewritten(input, JSON_SOURCE_ESCAPE, decodeJsonEscape),
  id: "json-string",
};

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

const HTML_ENTITY_DECODER: Decoder = {
  decode: (input) => rewritten(input, HTML_ENTITY_SOURCE, decodeEntity),
  id: "html-entity",
};

const TAG_SOURCE = /<[^<>\n]{0,200}>/gu;

const TAG_DECODER: Decoder = {
  decode: (input) => rewritten(input, TAG_SOURCE, () => " "),
  id: "tag",
};

const PERCENT_SOURCE = /(?:%[0-9a-fA-F]{2})+/gu;

const decodePercent = (match: string) => {
  try {
    return decodeURIComponent(match);
  } catch {
    return match;
  }
};

const PERCENT_DECODER: Decoder = {
  decode: (input) => rewritten(input, PERCENT_SOURCE, decodePercent),
  id: "percent",
};

const folded = (code: number) => FOLDED_CODE[code] === 1;

const stripped = (code: number) => STRIPPED_CODE[code] === 1;

const SEPARATOR: Decoder = {
  decode: (input) => {
    const { text } = input;

    const parts: string[] = [];

    const origins: number[] = [];

    let segmentStart = 0;

    let endedWithSeparator = true;

    let changed = false;

    const append = (from: number, to: number) => {
      if (to <= from) {
        return;
      }

      parts.push(text.slice(from, to));

      for (let index = from; index < to; index += 1) {
        origins.push(originOf(input, index));
      }

      endedWithSeparator = false;
    };

    for (let index = 0; index < text.length; index += 1) {
      const code = text.codePointAt(index) ?? 0;

      if (stripped(code)) {
        changed = true;

        append(segmentStart, index);

        segmentStart = index + 1;

        continue;
      }

      if (!folded(code)) {
        continue;
      }

      append(segmentStart, index);

      if (!endedWithSeparator) {
        parts.push(" ");

        origins.push(originOf(input, index));

        endedWithSeparator = true;
      }

      changed = true;

      segmentStart = index + 1;
    }

    if (!changed) {
      return input;
    }

    append(segmentStart, text.length);

    return { origins: Int32Array.from(origins), text: parts.join("") };
  },
  id: "separator",
};

export const DECODERS: readonly Decoder[] = [
  JSON_STRING_DECODER,
  HTML_ENTITY_DECODER,
  TAG_DECODER,
  PERCENT_DECODER,
  SEPARATOR,
];

const MAX_PASSES = 3;

export const decodeText = (text: string): DecodedText => {
  let current: DecodedText = { text };

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let repeats = false;

    for (const decoder of DECODERS) {
      if (decoder === SEPARATOR) {
        continue;
      }

      const next = decoder.decode(current);

      if (next !== current) {
        repeats = true;
      }

      current = next;
    }

    if (!repeats) {
      break;
    }
  }

  return SEPARATOR.decode(current);
};
