// @effect-diagnostics nodeBuiltinImport:off -- This guard reads every tracked file through Git and the file system.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Option, Schema } from "effect";

import { containerContent, decodeChains, squeezeText } from "./decoded-text.ts";
import type { DecodedText } from "./decoded-text.ts";

const root = path.resolve(import.meta.dirname, "..");

const allowListPath = "scripts/no-personal-data-allow.json";

export const RULE_IDS = [
  "bank-account",
  "cloudflare-account-id",
  "cloudflare-hostname",
  "decode-did-not-settle",
  "email",
  "iban",
  "secret-block-scalar",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface SkippedEntry {
  readonly path: string;
  readonly reason: string;
}

export interface AllowEntry {
  readonly column?: string | undefined;
  readonly path: string;
  readonly reason: string;
  readonly value: string;
}

export interface AllowList {
  readonly skipped: readonly SkippedEntry[];
  readonly values: readonly AllowEntry[];
}

export interface PersonalDataFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: RuleId;
}

const SchemaAllowList = Schema.Struct({
  skipped: Schema.Array(
    Schema.Struct({
      path: Schema.NonEmptyString,
      reason: Schema.NonEmptyString,
    })
  ),
  values: Schema.Array(
    Schema.Struct({
      column: Schema.optional(Schema.NonEmptyString),
      path: Schema.NonEmptyString,
      reason: Schema.NonEmptyString,
      value: Schema.NonEmptyString,
    })
  ),
});

export const decodeAllowList = Schema.decodeUnknownSync(
  Schema.fromJsonString(SchemaAllowList)
);

const RESERVED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
]);

const RESERVED_EMAIL_SUFFIXES = [".example", ".invalid", ".localhost", ".test"];

const NO_REPLY_SENDERS = new Set([
  "noreply@anthropic.com",
  "noreply@github.com",
]);

const NO_REPLY_DOMAIN = "users.noreply.github.com";

const DIGIT = /[0-9]/u;

const IBAN_LENGTHS = new Map(
  Object.entries({
    AD: 24,
    AE: 23,
    AL: 28,
    AT: 20,
    AZ: 28,
    BA: 20,
    BE: 16,
    BG: 22,
    BH: 22,
    BI: 27,
    BR: 29,
    BY: 28,
    CH: 21,
    CR: 22,
    CY: 28,
    CZ: 24,
    DE: 22,
    DJ: 27,
    DK: 18,
    DO: 28,
    EE: 20,
    EG: 29,
    ES: 24,
    FI: 18,
    FK: 18,
    FO: 18,
    FR: 27,
    GB: 22,
    GE: 22,
    GI: 23,
    GL: 18,
    GR: 27,
    GT: 28,
    HR: 21,
    HU: 28,
    IE: 22,
    IL: 23,
    IQ: 23,
    IS: 26,
    IT: 27,
    JO: 30,
    KW: 30,
    KZ: 20,
    LB: 28,
    LC: 32,
    LI: 21,
    LT: 20,
    LU: 20,
    LV: 21,
    LY: 25,
    MC: 27,
    MD: 24,
    ME: 22,
    MK: 19,
    MN: 20,
    MR: 27,
    MT: 31,
    MU: 30,
    NI: 28,
    NL: 18,
    NO: 15,
    OM: 23,
    PK: 24,
    PL: 28,
    PS: 29,
    PT: 25,
    QA: 29,
    RO: 24,
    RS: 22,
    RU: 33,
    SA: 24,
    SC: 31,
    SD: 18,
    SE: 24,
    SI: 19,
    SK: 24,
    SM: 27,
    SO: 23,
    ST: 25,
    SV: 28,
    TL: 23,
    TN: 24,
    TR: 26,
    UA: 29,
    VA: 22,
    VG: 24,
    XK: 20,
    YE: 30,
  })
);

const NON_DIGIT_ALL = /[^0-9]/gu;

const NON_ALPHANUMERIC = /[^a-z0-9]/gu;

const digitsOf = (value: string) => value.replaceAll(NON_DIGIT_ALL, "");

const compactOf = (value: string) =>
  value.replaceAll(NON_ALPHANUMERIC, "").toLowerCase();

const passesIbanChecksum = (value: string) => {
  const rearranged = `${value.slice(4)}${value.slice(0, 4)}`.toUpperCase();

  let remainder = 0;

  for (const character of rearranged) {
    const digits =
      character >= "A" && character <= "Z"
        ? String((character.codePointAt(0) ?? 0) - 55)
        : character;

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
};

const EMAIL =
  /(?:"[^"\\<>()[\]{}|@]{0,63}[\p{L}\p{N}]"|[\p{L}\p{N}][\p{L}\p{M}\p{N}._%+'’-]*)@(?:[\p{L}\p{N}\p{M}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?\.)+[\p{L}\p{M}]{2,}/gu;

const CLOUDFLARE_ACCOUNT_ID = /\b[0-9a-f]{32}\b/giu;

const CLOUDFLARE_ACCOUNT_NAMED = /account[ _-]?id|dash\.cloudflare\.com/iu;

const CLOUDFLARE_HOSTNAME =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pages\.dev|workers\.dev|cloudflareaccess\.com)\b/giu;

const SORT_CODE_DIGITS = 6;

const ACCOUNT_DIGITS = 8;

const PAIR_DIGITS = SORT_CODE_DIGITS + ACCOUNT_DIGITS;

const PAIR_WINDOW = 120;

const PAIR_CONTEXT = 24;

const BANK_WORD = /sort|account|accno|bank|iban|routing/iu;

const DATE_ANY =
  /[0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2}|[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{4}/gu;

const CLOCK_ANY = /[0-9]{1,2}:[0-9]{1,2}(?::[0-9]{1,2})?/gu;

const DATE_WINDOW = 16;

const ACCOUNT_CONTEXT = 3;

const BLOCK_KEY_LINE =
  /^[ \t]*(?:-[ \t]+)?(?<key>"[^"]*"|'[^']*'|[^:#]*?)[ \t]*:[ \t]*(?<rest>.*)$/u;

const TRAILING_COMMENT = /[ \t]+#.*$/u;

const SECRET_WORD = /(?:token|secret|password|passwd|api[_-]?key)/iu;

const BLOCK_INDICATOR = /^[|>](?:[1-9][+-]?|[+-][1-9]?)?$/u;

const BLOCK_SCALAR_TOKEN =
  /^[ \t]+(?<quote>["'`])?(?<token>[A-Za-z0-9_\-+=]{24,})\k<quote>(?:[ \t]+#.*)?$/u;

const readsAsBlockScalarKey = (line: string) => {
  if (!SECRET_WORD.test(line) || !line.includes(":")) {
    return false;
  }

  const groups = BLOCK_KEY_LINE.exec(line)?.groups;

  if (groups === undefined) {
    return false;
  }

  const key = (groups.key ?? "").replaceAll(/^["'`]+|["'`]+$/gu, "").trim();

  const rest = (groups.rest ?? "").replace(TRAILING_COMMENT, "").trim();

  return SECRET_WORD.test(key) && BLOCK_INDICATOR.test(rest);
};

const BLOCK_SCALAR_ENTROPY = 3.5;

const indentOf = (line: string) => line.length - line.trimStart().length;

const entropyOf = (value: string) => {
  const counts = new Map<string, number>();

  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  let entropy = 0;

  for (const count of counts.values()) {
    const share = count / value.length;

    entropy -= share * Math.log2(share);
  }

  return entropy;
};

const readsAsBlockScalarToken = (value: string) =>
  DIGIT.test(value) &&
  /\p{L}/u.test(value) &&
  entropyOf(value) >= BLOCK_SCALAR_ENTROPY;

const blockScalarFindings = (
  filePath: string,
  lines: readonly string[],
  allow: AllowList,
  lineAt: (index: number) => number
): readonly PersonalDataFinding[] => {
  const findings: PersonalDataFinding[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!readsAsBlockScalarKey(line)) {
      continue;
    }

    const keyIndent = indentOf(line);

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor] ?? "";

      if (next.trim().length === 0) {
        continue;
      }

      if (indentOf(next) <= keyIndent) {
        break;
      }

      const value = BLOCK_SCALAR_TOKEN.exec(next)?.groups?.token;

      if (
        value !== undefined &&
        readsAsBlockScalarToken(value) &&
        !allowsValue(allow, filePath, value)
      ) {
        findings.push({
          file: filePath,
          line: lineAt(cursor) + 1,
          rule: "secret-block-scalar",
        });
      }
    }
  }

  return findings;
};

const unescaped = (text: string) => text.replaceAll(/\\[nrtbfv0]/gu, "  ");

const EXAMPLE_HOSTNAMES = new Set([
  "example.cloudflareaccess.com",
  "example.pages.dev",
  "example.workers.dev",
]);

const CONFIG_FILE = /\.(?:env|json|jsonc|toml|ya?ml)$/u;

const ADVICE: Record<RuleId, string> = {
  "decode-did-not-settle":
    "text that still changes after eight decoding passes. The guard cannot tell what it says, so it treats it as hidden data. Fix: write the value plainly, as one escaped or encoded form rather than nested layers.",
  "bank-account":
    "a sort code with an account number. Bank details belong to a person, and anyone can read this repository. Fix: delete the pair and read it from user data, scoped to a `Profile`.",
  "cloudflare-account-id":
    "a Cloudflare account id in a config file or beside an account name. An account id names one deployment, and source is public. Fix: read it from `Config` in `apps/infra/alchemy.run.ts`, or use an example value.",
  "cloudflare-hostname":
    "a deployment hostname on a Cloudflare domain. Real hostnames point at a live account, and examples do not need one. Fix: use `example.workers.dev` or `example.pages.dev`.",
  email:
    "an email address on a real domain. Personal data belongs in the database, scoped to a profile, never in source. Fix: replace it with an example address (`demo@example.com`) or move it to user data.",
  iban: "an International Bank Account Number. Bank details belong to a person, and anyone can read this repository. Fix: delete the number and read it from user data, scoped to a `Profile`.",
  "secret-block-scalar":
    "a token written on the indented line below its key. A block scalar keeps the value, and anyone can read this repository. Fix: read it from the environment with varlock, or use a made-up example value.",
};

const ADDRESS_NOISE = /[\u200B-\u200D\u2060\uFEFF]/gu;

const readableAddress = (address: string) =>
  address.replaceAll(ADDRESS_NOISE, "").normalize("NFKC").toLowerCase();

const domainOf = (address: string) => {
  const readable = readableAddress(address);

  return readable.slice(readable.lastIndexOf("@") + 1);
};

const hasReservedDomain = (address: string) => {
  const domain = domainOf(address);

  return (
    RESERVED_EMAIL_DOMAINS.has(domain) ||
    RESERVED_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix))
  );
};

const isExampleHostname = (hostname: string) =>
  EXAMPLE_HOSTNAMES.has(hostname.toLowerCase());

export const isConfigFile = (filePath: string) =>
  CONFIG_FILE.test(filePath) || path.basename(filePath).startsWith(".env");

const allowsValue = (allow: AllowList, filePath: string, value: string) =>
  allow.values.some(
    (entry) =>
      entry.column === undefined &&
      entry.path === filePath &&
      entry.value.toLowerCase() === value.toLowerCase()
  );

const allowsEmail = (allow: AllowList, filePath: string, address: string) => {
  const email = readableAddress(address);

  return (
    hasReservedDomain(email) ||
    NO_REPLY_SENDERS.has(email) ||
    domainOf(email) === NO_REPLY_DOMAIN ||
    allowsValue(allow, filePath, address)
  );
};

export const isSkippedPath = (filePath: string, allow: AllowList) =>
  allow.skipped.some((entry) => entry.path === filePath);

const previousTexts = (
  lines: readonly string[],
  index: number,
  count: number
) => {
  const texts: string[] = [];

  for (
    let cursor = index - 1;
    cursor >= 0 && texts.length < count;
    cursor -= 1
  ) {
    const text = lines[cursor];

    if (text !== undefined && text.trim().length > 0) {
      texts.push(text);
    }
  }

  return texts;
};

const namesAccount = (
  lines: readonly string[],
  index: number,
  current: string
) =>
  [current, ...previousTexts(lines, index, ACCOUNT_CONTEXT)].some((text) =>
    CLOUDFLARE_ACCOUNT_NAMED.test(text)
  );

const lineStartsOf = (lines: readonly string[]) => {
  const starts: number[] = [];

  let offset = 0;

  for (const line of lines) {
    starts.push(offset);

    offset += line.length + 1;
  }

  return starts;
};

const lineIndexOf = (starts: readonly number[], position: number) => {
  let low = 0;

  let high = starts.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if ((starts[middle] ?? 0) <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
};

interface TextSource {
  readonly gapAt: (position: number) => string;
  readonly lineAt: (position: number) => number;
  readonly lineStarts: readonly number[];
  readonly raw: string;
  readonly rawEndOf: (position: number) => number;
  readonly rawOf: (start: number, end: number) => string;
  readonly rawStartOf: (position: number) => number;
  readonly text: string;
}

const viewSource = (
  text: string,
  view: DecodedText,
  parent?: string,
  starts: readonly number[] = lineStartsOf(linesOfText(text))
): TextSource => {
  const { offsets, origins } = view;

  const at = (position: number) => origins?.[position] ?? position;

  const gapAt = (position: number) => {
    if (offsets === undefined) {
      return parent === undefined
        ? text.slice(at(position) + 1, at(position + 1))
        : "";
    }

    return (parent ?? "").slice(
      (offsets[position] ?? 0) + 1,
      offsets[position + 1] ?? 0
    );
  };

  return {
    gapAt,
    lineAt: (position) => lineIndexOf(starts, at(position)),
    lineStarts: starts,
    raw: text,
    rawEndOf: (position) => at(position - 1) + 1,
    rawOf: (start, end) => text.slice(at(start), at(end - 1) + 1),
    rawStartOf: at,
    text: view.text,
  };
};

interface Span {
  readonly end: number;
  readonly start: number;
  readonly value: string;
}

const IBAN_GAP = /[\s.,:=+\u2013\u2014*_~`-]/u;

const LETTER = /\p{L}/u;

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

const READABLE_DIGITS = /^[0-9]{2}$/u;

const ibanCandidateAt = (text: string, start: number): Span | undefined => {
  const compact: string[] = [];

  const positions: number[] = [];

  let cursor = start;

  while (cursor < text.length && compact.length < 34) {
    const character = text[cursor] ?? "";

    if (LETTER_OR_DIGIT.test(character)) {
      compact.push(character.toUpperCase());

      positions.push(cursor);

      cursor += 1;
    } else if (IBAN_GAP.test(character)) {
      cursor += 1;
    } else {
      break;
    }

    if (compact.length === 4) {
      break;
    }
  }

  const country = compact.slice(0, 2).join("");

  const length = IBAN_LENGTHS.get(country);

  if (
    length === undefined ||
    !LETTER.test(compact[0] ?? "") ||
    !LETTER.test(compact[1] ?? "") ||
    !READABLE_DIGITS.test(compact.slice(2, 4).join(""))
  ) {
    return undefined;
  }

  while (cursor < text.length && compact.length < length) {
    const character = text[cursor] ?? "";

    if (LETTER_OR_DIGIT.test(character)) {
      compact.push(character.toUpperCase());

      positions.push(cursor);

      cursor += 1;

      continue;
    }

    if (!IBAN_GAP.test(character)) {
      return undefined;
    }

    cursor += 1;
  }

  if (compact.length !== length) {
    return undefined;
  }

  return {
    end: (positions.at(-1) ?? start) + 1,
    start,
    value: compact.join(""),
  };
};

const IBAN_START = /(?<![\p{L}\p{N}])[\p{L}]/gu;

const SQUEEZED_IBAN_START = /(?=[a-z]{2}[0-9]{2})/gu;

const LETTERS_ALL = /\p{L}/gu;

const readsAsIbanLike = (value: string) => {
  const body = value.slice(4);

  return (
    body.replaceAll(LETTERS_ALL, "").length >
    body.replaceAll(/[^\p{L}]/gu, "").length
  );
};

export const VIEW_IDS = [
  "raw",
  "readable",
  "squeezed",
  "squeezed-tagged",
  "unquoted",
  "unwrapped",
  "stripped",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export interface GuardView {
  readonly id: ViewId;
  readonly source: TextSource;
}

interface BuiltViews {
  readonly settled: boolean;
  readonly views: (id: ViewId) => readonly GuardView[];
}

const buildViews = (text: string): BuiltViews => {
  const chains = decodeChains(text);

  const { readable, unquoted, unwrapped } = chains.asWritten;

  const starts = lineStartsOf(linesOfText(text));

  const sources = new Map<ViewId, TextSource>();

  const raw: TextSource = viewSource(text, { text }, undefined, starts);

  const viewsReadable = viewSource(text, readable.text, undefined, starts);

  const squeezed = viewSource(
    text,
    squeezeText(unwrapped.text),
    unwrapped.text.text,
    starts
  );

  sources.set("raw", raw);

  sources.set("readable", viewsReadable);

  sources.set(
    "unquoted",
    unquoted.text.text === readable.text.text
      ? viewsReadable
      : viewSource(text, unquoted.text, undefined, starts)
  );

  sources.set("squeezed", squeezed);

  sources.set(
    "squeezed-tagged",
    readable.text.text === unwrapped.text.text
      ? squeezed
      : viewSource(text, squeezeText(readable.text), readable.text.text, starts)
  );

  sources.set(
    "unwrapped",
    readable.text.text === unwrapped.text.text
      ? viewsReadable
      : viewSource(text, unwrapped.text, undefined, starts)
  );

  const strippedSources: TextSource[] = [];

  const seenStripped = new Set<string>();

  for (const chain of chains.stripped) {
    if (
      chain.text.text === unwrapped.text.text ||
      seenStripped.has(chain.text.text)
    ) {
      continue;
    }

    seenStripped.add(chain.text.text);

    strippedSources.push(viewSource(text, chain.text, chain.view, starts));
  }

  const single = (id: ViewId): GuardView => ({
    id,
    source: sources.get(id) ?? raw,
  });

  return {
    settled:
      chains.asWritten.settled &&
      chains.stripped.every((chain) => chain.settled),
    views: (id) =>
      id === "stripped"
        ? strippedSources.map((source) => ({ id, source }))
        : [single(id)],
  };
};

const CARRIAGE_RETURN = /\r$/u;

const linesOfText = (text: string) =>
  text.split("\n").map((line) => line.replace(CARRIAGE_RETURN, ""));

const LINE_CACHE = new WeakMap<GuardView, readonly string[]>();

const LINE_START_CACHE = new WeakMap<GuardView, readonly number[]>();

const lineStartsOfView = (view: GuardView): readonly number[] => {
  if (view.source.text === view.source.raw) {
    return view.source.lineStarts;
  }

  const cached = LINE_START_CACHE.get(view);

  if (cached !== undefined) {
    return cached;
  }

  const starts: number[] = [0];

  let position = 0;

  for (const line of linesOfText(view.source.text)) {
    position += line.length + 1;

    starts.push(position);
  }

  LINE_START_CACHE.set(view, starts);

  return starts;
};

const linesOf = (view: GuardView) => {
  if (view.source.text === view.source.raw) {
    return rawLinesOf(view.source);
  }

  const cached = LINE_CACHE.get(view);

  if (cached !== undefined) {
    return cached;
  }

  const lines = linesOfText(view.source.text);

  LINE_CACHE.set(view, lines);

  return lines;
};

interface IbanSpans {
  readonly found: readonly Span[];
  readonly suppressors: readonly Span[];
}

const IBAN_CACHE = new WeakMap<GuardView, IbanSpans>();

const UPPER_OFFSET = 32;

const UPPER_LETTER_LOW = 65;

const UPPER_LETTER_HIGH = 90;

const LOWER_LETTER_LOW = 97;

const asUpperCaseCode = (code: number) =>
  code >= LOWER_LETTER_LOW && code <= LOWER_LETTER_LOW + 25
    ? code - UPPER_OFFSET
    : code;

const readsAsUpperLetter = (code: number) =>
  code >= UPPER_LETTER_LOW && code <= UPPER_LETTER_HIGH;

const COUNTRY_GAP_LIMIT = 3;

const readsAsCountryCode = (text: string, index: number) => {
  const first = asUpperCaseCode(text.codePointAt(index) ?? 0);

  if (!readsAsUpperLetter(first)) {
    return false;
  }

  for (
    let cursor = index + 1;
    cursor <= index + 1 + COUNTRY_GAP_LIMIT;
    cursor += 1
  ) {
    const character = text[cursor] ?? "";

    const code = asUpperCaseCode(text.codePointAt(cursor) ?? 0);

    if (readsAsUpperLetter(code)) {
      return IBAN_LENGTHS.has(
        `${String.fromCodePoint(first)}${String.fromCodePoint(code)}`
      );
    }

    if (!IBAN_GAP.test(character)) {
      return false;
    }
  }

  return false;
};

const ibanStartsIn = (view: GuardView): readonly number[] => {
  const pattern = view.id.startsWith("squeezed")
    ? SQUEEZED_IBAN_START
    : IBAN_START;

  return [...view.source.text.matchAll(pattern)].flatMap((match) =>
    match.index === undefined ||
    (!view.id.startsWith("squeezed") &&
      !readsAsCountryCode(view.source.text, match.index))
      ? []
      : [match.index]
  );
};

const EMPHASIS_MARKUP = /^[\p{L}\p{N}\s*_~`\u200B-\u200D\u2060\uFEFF]*$/u;

const readsFromWordStart = (source: TextSource, span: Span) => {
  const start = source.rawStartOf(span.start);

  const before = start === 0 ? "" : (source.raw[start - 1] ?? "");

  return !LETTER_OR_DIGIT.test(before);
};

const keepsEmphasisMarkup = (source: TextSource, span: Span) =>
  readsFromWordStart(source, span) &&
  EMPHASIS_MARKUP.test(
    source.raw.slice(source.rawStartOf(span.start), source.rawEndOf(span.end))
  );

const ibanSpansOf = (view: GuardView): IbanSpans => {
  const cached = IBAN_CACHE.get(view);

  if (cached !== undefined) {
    return cached;
  }

  const squeezed = view.id.startsWith("squeezed");

  const spans = ibanStartsIn(view)
    .flatMap((start) => {
      const span = ibanCandidateAt(view.source.text, start);

      return span === undefined ? [] : [span];
    })
    .filter((span) => !squeezed || readsFromWordStart(view.source, span));

  const built = {
    found: spans.filter(
      (span) =>
        passesIbanChecksum(span.value) &&
        readsAsIbanLike(span.value) &&
        (!squeezed || keepsEmphasisMarkup(view.source, span))
    ),
    suppressors: spans.filter(
      (span) => passesIbanChecksum(span.value) || readsAsIbanLike(span.value)
    ),
  };

  IBAN_CACHE.set(view, built);

  return built;
};

const rawSpans = (source: TextSource, spans: readonly Span[]) =>
  spans.map((span) => ({
    end: source.rawEndOf(span.end),
    start: source.rawStartOf(span.start),
  }));

interface DigitRun {
  readonly end: number;
  readonly start: number;
}

interface BankAtoms {
  readonly accounts: readonly DigitRun[];
  readonly sortCodes: readonly DigitRun[];
}

interface DigitGroup {
  readonly digits: readonly number[];
  readonly end: number;
  readonly start: number;
}

const BANK_GAP = /^[\s.+\-\u2010-\u2015*_~`\u200B-\u200D\u2060\uFEFF]*$/u;

const SORT_BOUNDARIES: readonly number[] = [2, 4];

const ACCOUNT_BOUNDARIES: readonly number[] = [4];

const LINE_BREAK = /[\n\r]/u;

const DIGITS_WITH_GAPS =
  /[0-9]+(?:[\s.+\-\u2010-\u2015*_~`\u200B-\u200D\u2060\uFEFF]*[0-9]+)*/gu;

const gapBetween = (source: TextSource, left: number, right: number) =>
  right === left + 1 ? source.gapAt(left) : source.text.slice(left + 1, right);

const runsAsOneNumber = (source: TextSource, left: number, right: number) => {
  const gap = gapBetween(source, left, right);

  return BANK_GAP.test(gap) && !(right > left + 1 && LINE_BREAK.test(gap));
};

const readsAsBankNumber = (
  source: TextSource,
  digits: readonly number[],
  boundaries: readonly number[]
) => {
  for (let index = 0; index + 1 < digits.length; index += 1) {
    const gap = gapBetween(source, digits[index] ?? 0, digits[index + 1] ?? 0);

    if (!BANK_GAP.test(gap)) {
      return false;
    }

    const visible = gap.replaceAll(FORMATTING_NOISE, "");

    if (visible.length > 0 && !boundaries.includes(index + 1)) {
      return false;
    }
  }

  return true;
};

const groupOf = (digits: readonly number[]): DigitGroup => ({
  digits,
  end: (digits.at(-1) ?? 0) + 1,
  start: digits[0] ?? 0,
});

const groupsIn = (
  source: TextSource,
  span: DigitRun
): readonly DigitGroup[] => {
  const groups: DigitGroup[] = [];

  let digits: number[] = [];

  let previous = -1;

  for (let position = span.start; position < span.end; position += 1) {
    if (!DIGIT.test(source.text[position] ?? "")) {
      continue;
    }

    if (previous !== -1 && !runsAsOneNumber(source, previous, position)) {
      groups.push(groupOf(digits));

      digits = [];
    }

    digits.push(position);

    previous = position;
  }

  if (digits.length > 0) {
    groups.push(groupOf(digits));
  }

  return groups;
};

const readsAsEscapedPayload = (source: TextSource, group: DigitGroup) =>
  (source.text[group.start - 1] ?? "") === "%";

const BASE64_CHARACTER = /[A-Za-z0-9+/]/u;

const UPPER_CASE = /[A-Z]/u;

const BASE64_TOKEN_MINIMUM = 16;

const readsAsBase64Token = (source: TextSource, group: DigitGroup) => {
  let from = group.start;

  let left = 0;

  while (
    from > 0 &&
    left < BASE64_TOKEN_MINIMUM &&
    BASE64_CHARACTER.test(source.text[from - 1] ?? "")
  ) {
    from -= 1;

    left += 1;
  }

  let to = group.end;

  let right = 0;

  while (
    to < source.text.length &&
    right < BASE64_TOKEN_MINIMUM &&
    BASE64_CHARACTER.test(source.text[to] ?? "")
  ) {
    to += 1;

    right += 1;
  }

  return (
    left + (group.end - group.start) + right >= BASE64_TOKEN_MINIMUM &&
    UPPER_CASE.test(source.text.slice(from, to))
  );
};

const BANK_ATOM_CACHE = new WeakMap<TextSource, BankAtoms>();

const bankAtomsOf = (source: TextSource): BankAtoms => {
  const cached = BANK_ATOM_CACHE.get(source);

  if (cached !== undefined) {
    return cached;
  }

  const built = bankAtomsIn(source);

  BANK_ATOM_CACHE.set(source, built);

  return built;
};

const bankAtomsIn = (source: TextSource): BankAtoms => {
  const accounts: DigitRun[] = [];

  const sortCodes: DigitRun[] = [];

  const collects = (group: DigitGroup) => {
    const { digits } = group;

    const { length } = digits;

    if (
      readsAsEscapedPayload(source, group) ||
      readsAsBase64Token(source, group)
    ) {
      return;
    }

    if (
      length === SORT_CODE_DIGITS &&
      readsAsBankNumber(source, digits, SORT_BOUNDARIES)
    ) {
      sortCodes.push({ end: group.end, start: group.start });
    }

    if (
      length === ACCOUNT_DIGITS &&
      readsAsBankNumber(source, digits, ACCOUNT_BOUNDARIES)
    ) {
      accounts.push({ end: group.end, start: group.start });
    }

    if (length !== PAIR_DIGITS) {
      return;
    }

    const sortFirst = digits.slice(0, SORT_CODE_DIGITS);

    const accountLast = digits.slice(SORT_CODE_DIGITS);

    const accountFirst = digits.slice(0, ACCOUNT_DIGITS);

    const sortLast = digits.slice(ACCOUNT_DIGITS);

    if (readsAsBankNumber(source, sortFirst, SORT_BOUNDARIES)) {
      sortCodes.push(groupOf(sortFirst));
    }

    if (readsAsBankNumber(source, accountLast, ACCOUNT_BOUNDARIES)) {
      accounts.push(groupOf(accountLast));
    }

    if (readsAsBankNumber(source, accountFirst, ACCOUNT_BOUNDARIES)) {
      accounts.push(groupOf(accountFirst));
    }

    if (readsAsBankNumber(source, sortLast, SORT_BOUNDARIES)) {
      sortCodes.push(groupOf(sortLast));
    }
  };

  for (const match of source.text.matchAll(DIGITS_WITH_GAPS)) {
    const start = match.index ?? 0;

    for (const group of groupsIn(source, {
      end: start + match[0].length,
      start,
    })) {
      collects(group);
    }
  }

  return { accounts, sortCodes };
};

const rawRun = (source: TextSource, run: DigitRun): DigitRun => ({
  end: source.rawEndOf(run.end),
  start: source.rawStartOf(run.start),
});

const overlaps = (run: DigitRun, spans: readonly DigitRun[]) =>
  spans.some((span) => span.start < run.end && run.start < span.end);

const distanceBetween = (left: DigitRun, right: DigitRun) =>
  left.start >= right.end ? left.start - right.end : right.start - left.end;

const FORMATTING_NOISE = /[\u200B-\u200D\u2060\uFEFF]/gu;

const RECORD_LIMIT = 2000;

const RECORD_BREAK = /\r\n|\r|\n/u;

interface LineSpan {
  readonly end: number;
  readonly start: number;
}

const BLANK_LINE = /^[ \t]*$/u;

const lineBoundsAt = (raw: string, position: number): LineSpan => {
  let start = 0;

  for (let index = position - 1; index >= 0; index -= 1) {
    const character = raw[index];

    if (character === "\n" || character === "\r") {
      start =
        character === "\r" && raw[index + 1] === "\n" ? index + 2 : index + 1;

      break;
    }
  }

  let end = start;

  while (end < raw.length && raw[end] !== "\n" && raw[end] !== "\r") {
    end += 1;
  }

  return { end, start };
};

const previousLine = (raw: string, span: LineSpan): LineSpan | undefined => {
  if (span.start === 0) {
    return undefined;
  }

  let cursor = span.start - 1;

  if (raw[cursor] === "\n" && raw[cursor - 1] === "\r") {
    cursor -= 1;
  }

  const end = cursor;

  let start = 0;

  for (let index = end - 1; index >= 0; index -= 1) {
    const character = raw[index];

    if (character === "\n" || character === "\r") {
      start =
        character === "\r" && raw[index + 1] === "\n" ? index + 2 : index + 1;

      break;
    }
  }

  return { end, start };
};

const followingLine = (raw: string, span: LineSpan): LineSpan | undefined => {
  if (span.end >= raw.length) {
    return undefined;
  }

  const start =
    raw[span.end] === "\r" && raw[span.end + 1] === "\n"
      ? span.end + 2
      : span.end + 1;

  let end = start;

  while (end < raw.length && raw[end] !== "\n" && raw[end] !== "\r") {
    end += 1;
  }

  return { end, start };
};

const visibleLine = (raw: string, span: LineSpan) =>
  raw.slice(span.start, span.end).replaceAll(FORMATTING_NOISE, "");

const blankLine = (raw: string, span: LineSpan) => {
  const line = visibleLine(raw, span);

  return BLANK_LINE.test(line) || containerContent(line).length === 0;
};

const deeper = (raw: string, span: LineSpan, floor: number) =>
  indentOf(visibleLine(raw, span)) >= floor;

const readsAsKeyLine = (raw: string, span: LineSpan) =>
  BLOCK_KEY_LINE.test(visibleLine(raw, span));

const recordOf = (raw: string, position: number): LineSpan => {
  const line = lineBoundsAt(raw, position);

  const floor = indentOf(raw.slice(line.start, line.end));

  let start = 0;

  let end = 0;

  ({ end, start } = line);

  let reached = line;

  for (;;) {
    const previous = previousLine(raw, reached);

    if (
      previous === undefined ||
      blankLine(raw, previous) ||
      (!deeper(raw, previous, floor) && readsAsKeyLine(raw, previous)) ||
      line.end - previous.start > RECORD_LIMIT
    ) {
      break;
    }

    ({ start } = previous);

    reached = previous;
  }

  reached = line;

  for (;;) {
    const next = followingLine(raw, reached);

    if (
      next === undefined ||
      blankLine(raw, next) ||
      (!deeper(raw, next, floor) && readsAsKeyLine(raw, next)) ||
      next.end - start > RECORD_LIMIT
    ) {
      break;
    }

    ({ end } = next);

    reached = next;
  }

  return { end, start };
};

const csvRecordEnd = (raw: string, position: number): number => {
  let quoted = false;

  for (let index = position; index < raw.length; index += 1) {
    const character = raw[index];

    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      return index;
    }
  }

  return raw.length;
};

const FIELD_HEAD = /(?:^|,)[ \t]*$/u;

const insideQuotedCell = (raw: string, position: number) => {
  const line = lineBoundsAt(raw, position);

  let opening = -1;

  let quotes = 0;

  for (let index = line.start; index < position; index += 1) {
    if (raw[index] === '"') {
      quotes += 1;

      opening = index;
    }
  }

  return (
    quotes % 2 === 1 &&
    opening >= 0 &&
    FIELD_HEAD.test(raw.slice(line.start, opening))
  );
};

interface RecordText {
  readonly at: (position: number) => number;
  readonly text: string;
}

const SQUEEZED_VIEWS = new Set<ViewId>(["squeezed", "squeezed-tagged"]);

const recordTextOf = (view: GuardView): RecordText =>
  SQUEEZED_VIEWS.has(view.id)
    ? { at: view.source.rawStartOf, text: view.source.raw }
    : { at: (position) => position, text: view.source.text };

const crossesRawLine = (
  source: TextSource,
  left: DigitRun,
  right: DigitRun
) => {
  const leftEnd = source.rawEndOf(left.end);

  const rightStart = source.rawStartOf(right.start);

  const from = Math.min(leftEnd, rightStart);

  const to = Math.max(leftEnd, rightStart);

  return RECORD_BREAK.test(source.raw.slice(from, to));
};

const labelledBefore = (
  source: TextSource,
  left: DigitRun,
  right: DigitRun
) => {
  const first = Math.min(
    source.rawStartOf(left.start),
    source.rawStartOf(right.start)
  );

  return BANK_WORD.test(
    source.raw.slice(Math.max(0, first - PAIR_CONTEXT), first)
  );
};

const sameRecord = (record: RecordText, left: DigitRun, right: DigitRun) => {
  const raw = record.text;

  const from = record.at(left.start);

  const to = record.at(right.start);

  const first = Math.min(from, to);

  const second = Math.max(from, to);

  if (second - first > RECORD_LIMIT) {
    return false;
  }

  if (!RECORD_BREAK.test(raw.slice(first, second))) {
    return true;
  }

  if (insideQuotedCell(raw, first) && csvRecordEnd(raw, first) >= second) {
    return true;
  }

  const span = recordOf(raw, first);

  return span.start <= second && second <= span.end;
};

const readsAsCsvRecord = (source: TextSource, position: number) => {
  const { text } = source;

  let from = position;

  while (from > 0 && text[from - 1] !== "\n") {
    from -= 1;
  }

  let to = position;

  while (to < text.length && text[to] !== "\n") {
    to += 1;
  }

  const row = text.slice(from, to).replace(CARRIAGE_RETURN, "");

  const headerEnd = text.indexOf("\n");

  const header = text.slice(0, headerEnd === -1 ? text.length : headerEnd);

  return (
    csvSpans(row).length > 2 &&
    BANK_WORD.test(header) &&
    row.length <= RECORD_LIMIT
  );
};

const nearestContext = (text: string, runs: readonly DigitRun[]) => {
  const first = Math.max(
    0,
    Math.min(...runs.map((run) => run.start)) - PAIR_CONTEXT
  );

  const last = Math.min(
    text.length,
    Math.max(...runs.map((run) => run.end)) + PAIR_CONTEXT
  );

  return text.slice(first, last).replaceAll(FORMATTING_NOISE, "");
};

const csvSpans = (line: string): readonly DigitRun[] => {
  const spans: DigitRun[] = [];

  let start = 0;

  let quoted = false;

  for (let position = 0; position < line.length; position += 1) {
    const character = line[position];

    if (character === '"') {
      quoted = !quoted;

      continue;
    }

    if (character === "," && !quoted) {
      spans.push({ end: position, start });

      start = position + 1;
    }
  }

  spans.push({ end: line.length, start });

  return spans;
};

const AMOUNT_COLUMN = /amount/iu;

const cellEntries = (allow: AllowList, filePath: string) =>
  allow.values.filter(
    (entry) => entry.path === filePath && entry.column !== undefined
  );

const RAW_LINES = new WeakMap<TextSource, readonly string[]>();

const rawLinesOf = (source: TextSource) => {
  const cached = RAW_LINES.get(source);

  if (cached !== undefined) {
    return cached;
  }

  const lines = linesOfText(source.raw);

  RAW_LINES.set(source, lines);

  return lines;
};

const amountColumnOf = (
  lines: readonly string[],
  source: TextSource,
  position: number
): string | undefined => {
  const header = lines[0] ?? "";

  const names = csvSpans(header).map((cell) =>
    header.slice(cell.start, cell.end).trim()
  );

  if (!names.some((name) => AMOUNT_COLUMN.test(name))) {
    return undefined;
  }

  const line = source.lineAt(position);

  if (line === 0) {
    return undefined;
  }

  const offset = source.rawStartOf(position) - (source.lineStarts[line] ?? 0);

  const row = lines[line] ?? "";

  const column = csvSpans(row).findIndex(
    (cell) => offset >= cell.start && offset < cell.end
  );

  const name = names[column];

  return name !== undefined && AMOUNT_COLUMN.test(name)
    ? name.toLowerCase()
    : undefined;
};

const allowsAmount = (
  allow: AllowList,
  filePath: string,
  source: TextSource,
  run: DigitRun
) => {
  const entries = cellEntries(allow, filePath);

  if (entries.length === 0) {
    return false;
  }

  const column = amountColumnOf(rawLinesOf(source), source, run.start);

  if (column === undefined) {
    return false;
  }

  const digits = digitsOf(source.text.slice(run.start, run.end));

  return entries.some(
    (entry) =>
      (entry.column ?? "").toLowerCase() === column &&
      digitsOf(entry.value) === digits
  );
};

const allowsDigits = (allow: AllowList, filePath: string, value: string) => {
  const digits = digitsOf(value);

  return allow.values.some(
    (entry) =>
      entry.column === undefined &&
      entry.path === filePath &&
      digitsOf(entry.value) === digits
  );
};

const allowsIban = (allow: AllowList, filePath: string, value: string) => {
  const compact = compactOf(value);

  return allow.values.some(
    (entry) =>
      entry.column === undefined &&
      entry.path === filePath &&
      compactOf(entry.value) === compact
  );
};

export interface RuleContext {
  readonly allow: AllowList;
  readonly filePath: string;
  readonly settled: boolean;
  readonly text: string;
  readonly view: GuardView;
}

const found = (
  filePath: string,
  rule: RuleId,
  line: number
): PersonalDataFinding => ({ file: filePath, line, rule });

const unsettledRule = ({ filePath, settled }: RuleContext) =>
  settled ? [] : [found(filePath, "decode-did-not-settle", 1)];

const ibanRule = ({ allow, filePath, view }: RuleContext) =>
  ibanSpansOf(view).found.flatMap((span) =>
    allowsIban(allow, filePath, span.value)
      ? []
      : [found(filePath, "iban", view.source.lineAt(span.start) + 1)]
  );

const partOfDateOrClock = (source: TextSource, run: DigitRun) => {
  const from = run.start;

  const to = run.end;

  const window = source.text.slice(
    Math.max(0, from - DATE_WINDOW),
    Math.min(source.text.length, to + DATE_WINDOW)
  );

  const windowStart = Math.max(0, from - DATE_WINDOW);

  return [DATE_ANY, CLOCK_ANY].some((pattern) =>
    [...window.matchAll(pattern)].some((match) => {
      const start = windowStart + (match.index ?? 0);

      return start < to && from < start + match[0].length;
    })
  );
};

const bankRule = ({ allow, filePath, view }: RuleContext) => {
  const { source } = view;

  const record = recordTextOf(view);

  const ibans = rawSpans(source, ibanSpansOf(view).suppressors);

  const { accounts, sortCodes } = bankAtomsOf(source);

  return sortCodes.flatMap((sortCode) => {
    if (overlaps(rawRun(source, sortCode), ibans)) {
      return [];
    }

    if (partOfDateOrClock(source, sortCode)) {
      return [];
    }

    if (allowsAmount(allow, filePath, source, sortCode)) {
      return [];
    }

    if (
      allowsDigits(
        allow,
        filePath,
        source.text.slice(sortCode.start, sortCode.end)
      )
    ) {
      return [];
    }

    const paired = accounts.some((account) => {
      if (overlaps(rawRun(source, account), ibans)) {
        return false;
      }

      const near = distanceBetween(sortCode, account) <= PAIR_WINDOW;

      if (!sameRecord(record, sortCode, account)) {
        return false;
      }

      if (
        SQUEEZED_VIEWS.has(view.id) &&
        crossesRawLine(source, sortCode, account) &&
        !labelledBefore(source, sortCode, account)
      ) {
        return false;
      }

      if (allowsAmount(allow, filePath, source, account)) {
        return false;
      }

      if (
        allowsDigits(
          allow,
          filePath,
          source.text.slice(account.start, account.end)
        )
      ) {
        return false;
      }

      return (
        BANK_WORD.test(nearestContext(source.text, [sortCode, account])) ||
        (!near && readsAsCsvRecord(source, sortCode.start))
      );
    });

    return paired
      ? [found(filePath, "bank-account", source.lineAt(sortCode.start) + 1)]
      : [];
  });
};

const FORMAT_CHARACTER = /[\u200B-\u200D\u2060\uFEFF]/u;

const ADDRESS_TAIL = /[\p{L}\p{M}\p{N}.-]/u;

const joinedAddress = (text: string, start: number, length: number) => {
  let cursor = start + length;

  for (;;) {
    let next = cursor;

    while (next < text.length && FORMAT_CHARACTER.test(text[next] ?? "")) {
      next += 1;
    }

    if (next === cursor) {
      return text.slice(start, cursor);
    }

    while (next < text.length && ADDRESS_TAIL.test(text[next] ?? "")) {
      next += 1;
    }

    cursor = next;
  }
};

const emailRule = ({ allow, filePath, view }: RuleContext) => {
  const text = unescaped(view.source.text);

  if (!text.includes("@")) {
    return [];
  }

  return [...text.matchAll(EMAIL)].flatMap((match) => {
    const [address] = match;

    const start = match.index ?? 0;

    if (address === undefined) {
      return [];
    }

    if (
      allowsEmail(allow, filePath, address) ||
      allowsEmail(allow, filePath, joinedAddress(text, start, address.length))
    ) {
      return [];
    }

    return [found(filePath, "email", view.source.lineAt(start) + 1)];
  });
};

const CLOUDFLARE_HOSTNAME_SUFFIX =
  /pages\.dev|workers\.dev|cloudflareaccess\.com/iu;

const hostnameRule = ({ allow, filePath, view }: RuleContext) =>
  CLOUDFLARE_HOSTNAME_SUFFIX.test(view.source.text)
    ? [...view.source.text.matchAll(CLOUDFLARE_HOSTNAME)].flatMap((match) => {
        const [hostname] = match;

        if (
          hostname === undefined ||
          isExampleHostname(hostname) ||
          allowsValue(allow, filePath, hostname)
        ) {
          return [];
        }

        return [
          found(
            filePath,
            "cloudflare-hostname",
            view.source.lineAt(match.index ?? 0) + 1
          ),
        ];
      })
    : [];

const CLOUDFLARE_ACCOUNT_ID_TEXT = /[0-9a-f]{32}/iu;

const accountIdRule = ({ allow, filePath, view }: RuleContext) => {
  if (!CLOUDFLARE_ACCOUNT_ID_TEXT.test(view.source.text)) {
    return [];
  }

  const lines = linesOf(view);

  const starts = lineStartsOfView(view);

  return lines.flatMap((line, index) => {
    if (!isConfigFile(filePath) && !namesAccount(lines, index, line)) {
      return [];
    }

    return [...line.matchAll(CLOUDFLARE_ACCOUNT_ID)].flatMap((match) => {
      const [value] = match;

      if (value === undefined || allowsValue(allow, filePath, value)) {
        return [];
      }

      return [
        found(
          filePath,
          "cloudflare-account-id",
          view.source.lineAt((starts[index] ?? 0) + (match.index ?? 0)) + 1
        ),
      ];
    });
  });
};

const blockScalarRule = ({ allow, filePath, view }: RuleContext) => {
  if (!SECRET_WORD.test(view.source.text)) {
    return [];
  }

  const starts = lineStartsOfView(view);

  return blockScalarFindings(filePath, linesOf(view), allow, (index) =>
    view.source.lineAt(starts[index] ?? 0)
  );
};

const RULES: Record<
  RuleId,
  (context: RuleContext) => readonly PersonalDataFinding[]
> = {
  "bank-account": bankRule,
  "cloudflare-account-id": accountIdRule,
  "cloudflare-hostname": hostnameRule,
  "decode-did-not-settle": unsettledRule,
  email: emailRule,
  iban: ibanRule,
  "secret-block-scalar": blockScalarRule,
};

export const GUARD_RULES: readonly RuleId[] = [
  "bank-account",
  "cloudflare-account-id",
  "cloudflare-hostname",
  "decode-did-not-settle",
  "email",
  "iban",
  "secret-block-scalar",
];

export interface MatrixCell {
  readonly applies: boolean;
  readonly reason: string;
}

const cell = (reason: string): MatrixCell => ({ applies: true, reason });

const skipped = (reason: string): MatrixCell => ({ applies: false, reason });

const RAW_ALWAYS =
  "a decode step adds a view and never replaces this one, and decoding can shorten a value, so the text as written is read by every rule";

const NAME_LOST =
  "squeezing joins words, so no label can sit beside the value it names";

const HIDDEN_ONLY = "one verdict per file, reported from the raw view";

const SQUEEZED_TAGGED_ONLY =
  "a value inside a markup attribute is still there once formatting is squeezed, while removing the tag would delete it";

const MARKUP_GONE =
  "markup is removed in the unwrapped view, and this text is that view with formatting squeezed out";

export const PERSONAL_DATA_MATRIX: Record<
  RuleId,
  Record<ViewId, MatrixCell>
> = {
  "bank-account": {
    raw: cell(RAW_ALWAYS),
    readable: cell(
      "an encoded sort code or account number only reads as one once undone"
    ),
    squeezed: cell(
      "formatting includes dates, labels and emphasis between the pair, and squeezing keeps both numbers while dropping that filler"
    ),
    "squeezed-tagged": cell(SQUEEZED_TAGGED_ONLY),
    unquoted: cell(
      "the same text read without the quoted-printable step, so a decoded layer is not eaten by a wrong guess about an equals sign"
    ),
    unwrapped: cell(
      "markup between a sort code and its account number is formatting, and the pair survives its removal"
    ),
    stripped: cell(
      "a value wrapped by an indentation, a quote prefix, a comment prefix, a list dash or a heredoc is joined once that wrapper is removed, and the pair only reads as a pair then"
    ),
  },
  "cloudflare-account-id": {
    raw: cell(
      "a config file names its account id beside the value, and this view holds that label"
    ),
    readable: cell(
      "an id written as JSON or percent escapes only reads as an id once undone"
    ),
    squeezed: skipped(NAME_LOST),
    "squeezed-tagged": skipped(NAME_LOST),
    unquoted: cell(
      "the same text read without the quoted-printable step, so an id written in a decoded layer is still read"
    ),
    unwrapped: cell(
      "markup between a label and its id hides the pair from the readable view"
    ),
    stripped: cell(
      "an id written through a wrapped encoding carries a container prefix or indentation that has to go before the value reads as an id"
    ),
  },
  "cloudflare-hostname": {
    raw: cell("a hostname written plainly is still a hostname here"),
    readable: cell(
      "a hostname written through an encoding only reads once undone"
    ),
    squeezed: skipped("squeezing drops the dots a hostname needs"),
    "squeezed-tagged": skipped("squeezing drops the dots a hostname needs"),
    unquoted: cell(
      "the same text read without the quoted-printable step, so a hostname in a decoded layer is still read"
    ),
    unwrapped: cell("markup inside a hostname hides it from the readable view"),
    stripped: cell(
      "a hostname written through a wrapped encoding reads once its container prefix or indentation is gone"
    ),
  },
  "decode-did-not-settle": {
    raw: cell(
      "a text that still changes after eight passes is a property of the file"
    ),
    readable: skipped(HIDDEN_ONLY),
    squeezed: skipped(HIDDEN_ONLY),
    "squeezed-tagged": skipped(HIDDEN_ONLY),
    unquoted: skipped(HIDDEN_ONLY),
    unwrapped: skipped(HIDDEN_ONLY),
    stripped: skipped(HIDDEN_ONLY),
  },
  email: {
    raw: cell(RAW_ALWAYS),
    readable: cell(
      "an address written through an encoding only reads once undone"
    ),
    squeezed: skipped("squeezing drops the at sign an address needs"),
    "squeezed-tagged": skipped("squeezing drops the at sign an address needs"),
    unquoted: cell(
      "the same text read without the quoted-printable step, so a decoded layer is not eaten by a wrong guess about an equals sign"
    ),
    unwrapped: cell("markup around an address hides it from the readable view"),
    stripped: cell(
      "an address joined across a soft break inside a block scalar, a quoted reply, a list item, a heredoc or a comment keeps its wrapper until that wrapper is removed"
    ),
  },
  iban: {
    raw: cell(RAW_ALWAYS),
    readable: cell(
      "an IBAN split by an encoding or by markup reads as one IBAN here"
    ),
    squeezed: cell(
      "emphasis markers inside an IBAN are formatting, and squeezing drops them"
    ),
    "squeezed-tagged": skipped(MARKUP_GONE),
    unquoted: cell(
      "the same text read without the quoted-printable step, so a decoded layer is not eaten by a wrong guess about an equals sign"
    ),
    unwrapped: cell("markup inside an IBAN hides it from the readable view"),
    stripped: cell(
      "an IBAN wrapped inside a block scalar or behind a quote prefix reads as an IBAN once its wrapper is removed"
    ),
  },
  "secret-block-scalar": {
    raw: cell("an indented value below its key is still indented here"),
    readable: cell("an encoded value under a key only reads once undone"),
    squeezed: skipped("squeezing drops the indentation a block scalar needs"),
    "squeezed-tagged": skipped(
      "squeezing drops the indentation a block scalar needs"
    ),
    unquoted: cell(
      "the same text read without the quoted-printable step, so an encoded value under a key is still read"
    ),
    unwrapped: cell("markup between a key and its value hides the pair"),
    stripped: skipped(
      "the strip removes the indentation a block scalar is made of, so this view has no block scalar left to read"
    ),
  },
};

const uniqueFindings = (findings: readonly PersonalDataFinding[]) => {
  const seen = new Map<string, PersonalDataFinding>();

  for (const finding of findings) {
    seen.set(`${finding.line}:${finding.rule}`, finding);
  }

  return [...seen.values()].toSorted(
    (left, right) =>
      left.line - right.line || left.rule.localeCompare(right.rule)
  );
};

export const findPersonalData = (
  filePath: string,
  text: string,
  allow: AllowList
): readonly PersonalDataFinding[] => {
  if (isSkippedPath(filePath, allow)) {
    return [];
  }

  const { settled, views } = buildViews(text);

  const findings: PersonalDataFinding[] = [];

  for (const rule of GUARD_RULES) {
    const scanned = new Set<unknown>();

    for (const viewId of VIEW_IDS) {
      if (!PERSONAL_DATA_MATRIX[rule][viewId].applies) {
        continue;
      }

      for (const guarded of views(viewId)) {
        if (scanned.has(guarded.source)) {
          continue;
        }

        scanned.add(guarded.source);

        findings.push(
          ...RULES[rule]({ allow, filePath, settled, text, view: guarded })
        );
      }
    }
  }

  return uniqueFindings(findings);
};

export const findingMessage = (finding: PersonalDataFinding) =>
  `${finding.file}:${finding.line}: ${ADVICE[finding.rule]}`;

const trackedFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf-8" })
    .split("\u0000")
    .filter((file) => file.length > 0);

const readText = (filePath: string): Option.Option<string> => {
  const bytes = readFileSync(path.resolve(root, filePath));

  return bytes.includes(0)
    ? Option.none()
    : Option.some(bytes.toString("utf-8"));
};

const scanFile = (
  filePath: string,
  allow: AllowList
): readonly PersonalDataFinding[] =>
  Option.match(readText(filePath), {
    onNone: () => [],
    onSome: (text) => findPersonalData(filePath, text, allow),
  });

const run = () => {
  const allow = decodeAllowList(
    readFileSync(path.join(root, allowListPath), "utf-8")
  );

  const requested = process.argv.slice(2);

  const files = requested.length > 0 ? requested : trackedFiles();

  const findings = files.flatMap((file) => scanFile(file, allow));

  if (findings.length === 0) {
    process.stdout.write(
      `check-no-personal-data: ${files.length} files carry no personal data, no real address, and no real deployment hostname.\n`
    );

    return;
  }

  process.stderr.write(
    `${findings.map(findingMessage).join("\n")}\n\n${findings.length} personal data findings. Each line names what it found and how to fix it. Values are not printed, so a leak never reaches a CI log.\n`
  );

  process.exitCode = 1;
};

if (import.meta.main) {
  run();
}
