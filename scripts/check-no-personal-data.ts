// @effect-diagnostics nodeBuiltinImport:off -- This guard reads every tracked file through Git and the file system.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Option, Schema } from "effect";

import { decodeTaggedText, decodeText, squeezeText } from "./decoded-text.ts";
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

const BANK_WORD = /sort|account|accno|bank|iban|routing/u;

const DIGIT_RUN = /[0-9]+/gu;

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
  allow: AllowList
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
          line: cursor + 1,
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

const domainOf = (address: string) =>
  address.slice(address.lastIndexOf("@") + 1).toLowerCase();

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
  const email = address.toLowerCase();

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
  starts: readonly number[] = lineStartsOf(text.split("\n"))
): TextSource => {
  const { offsets, origins } = view;

  const at = (position: number) => origins?.[position] ?? position;

  const gapAt = (position: number) =>
    offsets === undefined || parent === undefined
      ? text.slice(at(position) + 1, at(position + 1))
      : parent.slice((offsets[position] ?? 0) + 1, offsets[position + 1] ?? 0);

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

const readsAsIbanLike = (value: string) =>
  value.slice(4).replaceAll(LETTERS_ALL, "").length >= value.length - 10;

export const VIEW_IDS = [
  "raw",
  "readable",
  "squeezed",
  "squeezed-tagged",
  "unwrapped",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

export interface GuardView {
  readonly id: ViewId;
  readonly source: TextSource;
}

interface BuiltViews {
  readonly settled: boolean;
  readonly views: Record<ViewId, GuardView>;
}

const buildViews = (text: string): BuiltViews => {
  const unwrapped = decodeText(text);

  const readable = decodeTaggedText(text);

  const starts = lineStartsOf(text.split("\n"));

  const viewsReadable = viewSource(text, readable.text, undefined, starts);

  const squeezed = viewSource(
    text,
    squeezeText(unwrapped.text),
    unwrapped.text.text,
    starts
  );

  return {
    settled: readable.settled && unwrapped.settled,
    views: {
      raw: { id: "raw", source: viewSource(text, { text }, undefined, starts) },
      readable: {
        id: "readable",
        source: viewsReadable,
      },
      squeezed: { id: "squeezed", source: squeezed },
      "squeezed-tagged": {
        id: "squeezed-tagged",
        source:
          readable.text.text === unwrapped.text.text
            ? squeezed
            : viewSource(
                text,
                squeezeText(readable.text),
                readable.text.text,
                starts
              ),
      },
      unwrapped: {
        id: "unwrapped",
        source:
          readable.text.text === unwrapped.text.text
            ? viewsReadable
            : viewSource(text, unwrapped.text, undefined, starts),
      },
    },
  };
};

const LINE_CACHE = new WeakMap<GuardView, readonly string[]>();

const linesOf = (view: GuardView) => {
  if (view.source.text === view.source.raw) {
    return rawLinesOf(view.source);
  }

  const cached = LINE_CACHE.get(view);

  if (cached !== undefined) {
    return cached;
  }

  const lines = view.source.text.split("\n");

  LINE_CACHE.set(view, lines);

  return lines;
};

interface IbanSpans {
  readonly found: readonly Span[];
  readonly suppressors: readonly Span[];
}

const IBAN_CACHE = new WeakMap<GuardView, IbanSpans>();

const ibanStartsIn = (view: GuardView): readonly number[] => {
  const pattern = view.id.startsWith("squeezed")
    ? SQUEEZED_IBAN_START
    : IBAN_START;

  return [...view.source.text.matchAll(pattern)].flatMap((match) =>
    match.index === undefined ? [] : [match.index]
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

const BANK_GAP = /^[\s.\-\u2010-\u2015*_~`]*$/u;

const SORT_BOUNDARIES: readonly number[] = [2, 4];

const ACCOUNT_BOUNDARIES: readonly number[] = [4];

const readsAsBankNumber = (
  source: TextSource,
  run: DigitRun,
  boundaries: readonly number[]
) => {
  for (let position = run.start; position + 1 < run.end; position += 1) {
    const gap = source.gapAt(position);

    if (!BANK_GAP.test(gap)) {
      return false;
    }

    if (gap.length > 0 && !boundaries.includes(position - run.start + 1)) {
      return false;
    }
  }

  return true;
};

const bankGroupsIn = (
  source: TextSource,
  run: DigitRun
): readonly DigitRun[] => {
  const groups: DigitRun[] = [];

  const { gapAt } = source;

  let { start } = run;

  for (let position = run.start; position + 1 < run.end; position += 1) {
    if (BANK_GAP.test(gapAt(position))) {
      continue;
    }

    groups.push({ end: position + 1, start });

    start = position + 1;
  }

  groups.push({ end: run.end, start });

  return groups;
};

const bankAtomsOf = (source: TextSource): BankAtoms => {
  const accounts: DigitRun[] = [];

  const sortCodes: DigitRun[] = [];

  const collects = (group: DigitRun) => {
    const length = group.end - group.start;

    if (
      length === SORT_CODE_DIGITS &&
      readsAsBankNumber(source, group, SORT_BOUNDARIES)
    ) {
      sortCodes.push(group);
    }

    if (
      length === ACCOUNT_DIGITS &&
      readsAsBankNumber(source, group, ACCOUNT_BOUNDARIES)
    ) {
      accounts.push(group);
    }

    if (length !== PAIR_DIGITS) {
      return;
    }

    const sortFirst = {
      end: group.start + SORT_CODE_DIGITS,
      start: group.start,
    };

    const accountLast = {
      end: group.end,
      start: group.start + SORT_CODE_DIGITS,
    };

    const accountFirst = {
      end: group.start + ACCOUNT_DIGITS,
      start: group.start,
    };

    const sortLast = { end: group.end, start: group.start + ACCOUNT_DIGITS };

    if (readsAsBankNumber(source, sortFirst, SORT_BOUNDARIES)) {
      sortCodes.push(sortFirst);
    }

    if (readsAsBankNumber(source, accountLast, ACCOUNT_BOUNDARIES)) {
      accounts.push(accountLast);
    }

    if (readsAsBankNumber(source, accountFirst, ACCOUNT_BOUNDARIES)) {
      accounts.push(accountFirst);
    }

    if (readsAsBankNumber(source, sortLast, SORT_BOUNDARIES)) {
      sortCodes.push(sortLast);
    }
  };

  for (const match of source.text.matchAll(DIGIT_RUN)) {
    const start = match.index ?? 0;

    for (const group of bankGroupsIn(source, {
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

const nearestContext = (text: string, runs: readonly DigitRun[]) => {
  const first = Math.max(
    0,
    Math.min(...runs.map((run) => run.start)) - PAIR_CONTEXT
  );

  const last = Math.min(
    text.length,
    Math.max(...runs.map((run) => run.end)) + PAIR_CONTEXT
  );

  return text.slice(first, last);
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

  const lines = source.raw.split("\n");

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
  const from = source.rawStartOf(run.start);

  const to = source.rawEndOf(run.end);

  const window = source.raw.slice(
    Math.max(0, from - DATE_WINDOW),
    Math.min(source.raw.length, to + DATE_WINDOW)
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
      if (
        overlaps(rawRun(source, account), ibans) ||
        distanceBetween(sortCode, account) > PAIR_WINDOW
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

      return BANK_WORD.test(nearestContext(source.text, [sortCode, account]));
    });

    return paired
      ? [found(filePath, "bank-account", source.lineAt(sortCode.start) + 1)]
      : [];
  });
};

const emailRule = ({ allow, filePath, view }: RuleContext) => {
  const text = unescaped(view.source.text);

  if (!text.includes("@")) {
    return [];
  }

  return [...text.matchAll(EMAIL)].flatMap((match) => {
    const [address] = match;

    if (address === undefined || allowsEmail(allow, filePath, address)) {
      return [];
    }

    return [found(filePath, "email", view.source.lineAt(match.index ?? 0) + 1)];
  });
};

const hostnameRule = ({ allow, filePath, view }: RuleContext) =>
  [...view.source.text.matchAll(CLOUDFLARE_HOSTNAME)].flatMap((match) => {
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
  });

const accountIdRule = ({ allow, filePath, view }: RuleContext) => {
  const lines = linesOf(view);

  return lines.flatMap((line, index) => {
    if (!isConfigFile(filePath) && !namesAccount(lines, index, line)) {
      return [];
    }

    return [...line.matchAll(CLOUDFLARE_ACCOUNT_ID)].flatMap((match) => {
      const [value] = match;

      if (value === undefined || allowsValue(allow, filePath, value)) {
        return [];
      }

      return [found(filePath, "cloudflare-account-id", index + 1)];
    });
  });
};

const blockScalarRule = ({ allow, filePath, view }: RuleContext) =>
  blockScalarFindings(filePath, linesOf(view), allow);

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

const PLAIN_TEXT_KEPT =
  "the view holds this text with every encoding undone, so anything written plainly is still readable";

const SQUEEZED_ORDER =
  "the squeezed view keeps every digit and letter in order and removes only formatting, so a value read here is read there";

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
    raw: skipped(SQUEEZED_ORDER),
    readable: skipped(SQUEEZED_ORDER),
    squeezed: cell(
      "formatting includes dates, labels and emphasis between the pair, and squeezing keeps both numbers while dropping that filler"
    ),
    "squeezed-tagged": cell(SQUEEZED_TAGGED_ONLY),
    unwrapped: skipped(SQUEEZED_ORDER),
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
    unwrapped: cell(
      "markup between a label and its id hides the pair from the readable view"
    ),
  },
  "cloudflare-hostname": {
    raw: cell("a hostname written plainly is still a hostname here"),
    readable: cell(
      "a hostname written through an encoding only reads once undone"
    ),
    squeezed: skipped("squeezing drops the dots a hostname needs"),
    "squeezed-tagged": skipped("squeezing drops the dots a hostname needs"),
    unwrapped: cell("markup inside a hostname hides it from the readable view"),
  },
  "decode-did-not-settle": {
    raw: cell(
      "a text that still changes after eight passes is a property of the file"
    ),
    readable: skipped(HIDDEN_ONLY),
    squeezed: skipped(HIDDEN_ONLY),
    "squeezed-tagged": skipped(HIDDEN_ONLY),
    unwrapped: skipped(HIDDEN_ONLY),
  },
  email: {
    raw: skipped(PLAIN_TEXT_KEPT),
    readable: cell(
      "an address written through an encoding only reads once undone"
    ),
    squeezed: skipped("squeezing drops the at sign an address needs"),
    "squeezed-tagged": skipped("squeezing drops the at sign an address needs"),
    unwrapped: cell("markup around an address hides it from the readable view"),
  },
  iban: {
    raw: skipped(PLAIN_TEXT_KEPT),
    readable: cell(
      "an IBAN split by an encoding or by markup reads as one IBAN here"
    ),
    squeezed: cell(
      "emphasis markers inside an IBAN are formatting, and squeezing drops them"
    ),
    "squeezed-tagged": skipped(MARKUP_GONE),
    unwrapped: cell("markup inside an IBAN hides it from the readable view"),
  },
  "secret-block-scalar": {
    raw: cell("an indented value below its key is still indented here"),
    readable: cell("an encoded value under a key only reads once undone"),
    squeezed: skipped("squeezing drops the indentation a block scalar needs"),
    "squeezed-tagged": skipped(
      "squeezing drops the indentation a block scalar needs"
    ),
    unwrapped: cell("markup between a key and its value hides the pair"),
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

      if (scanned.has(views[viewId].source)) {
        continue;
      }

      scanned.add(views[viewId].source);

      findings.push(
        ...RULES[rule]({ allow, filePath, settled, text, view: views[viewId] })
      );
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
