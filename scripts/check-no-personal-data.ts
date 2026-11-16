// @effect-diagnostics nodeBuiltinImport:off -- This guard reads every tracked file through Git and the file system.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Option, Schema } from "effect";

import {
  decodeText,
  SEPARATOR_CLASS,
  SEPARATOR_CODE,
  SEPARATOR_EDGES,
  SEPARATOR_RUN,
} from "./decoded-text.ts";

const root = path.resolve(import.meta.dirname, "..");

const allowListPath = "scripts/no-personal-data-allow.json";

export const RULE_IDS = [
  "bank-account",
  "cloudflare-account-id",
  "cloudflare-hostname",
  "email",
  "iban",
  "secret-block-scalar",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface AllowEntry {
  readonly path: string;
  readonly reason: string;
  readonly value: string;
}

export interface SkippedEntry {
  readonly path: string;
  readonly reason: string;
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

const NUMBER_RUN = new RegExp(`[0-9${SEPARATOR_CLASS}]+`, "gu");

const IBAN_RUN = new RegExp(`[\\p{L}\\p{N}${SEPARATOR_CLASS}]+`, "gu");

const IBAN_EDGE = /[\p{L}\p{N}_]/u;

const TOKEN_EDGE = /[\p{L}\p{N}_:+/]/u;

const ALNUM = /[\p{L}\p{N}]/u;

const LETTER = /\p{L}/u;

const DIGIT = /[0-9]/u;

const IBAN_HEAD = /^[\p{L}]{2}[0-9]{2}/u;

const IBAN_MAX_LENGTH = 33;

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

const NON_LETTER = /[^\p{L}]/gu;

const NON_DIGIT = /[^\p{N}]/gu;

const DIGIT_BLOCK = /[0-9]+/gu;

const ACCOUNT_RUN = 4;

const longestDigitRunIn = (value: string) => {
  let longest = 0;

  for (const match of value.matchAll(DIGIT_BLOCK)) {
    longest = Math.max(longest, match[0].length);
  }

  return longest;
};

const readsAsIban = (value: string) => {
  const compact = value.replaceAll(SEPARATOR_RUN, "");

  if (longestDigitRunIn(compact.slice(4)) < ACCOUNT_RUN) {
    return false;
  }

  const letters = value.replaceAll(NON_LETTER, "");

  if (letters === letters.toUpperCase()) {
    return true;
  }

  if (
    value.split(SEPARATOR_RUN).filter((group) => group.length > 0).length <= 1
  ) {
    return true;
  }

  return value.replaceAll(NON_DIGIT, "").length >= letters.length;
};

const EMAIL =
  /(?:"[^"\\\s]{1,64}"|[\p{L}\p{N}][\p{L}\p{M}\p{N}._%+'’-]*)@(?:[\p{L}\p{N}\p{M}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?\.)+[\p{L}\p{M}]{2,}/gu;

const CLOUDFLARE_ACCOUNT_ID = /\b[0-9a-f]{32}\b/giu;

const CLOUDFLARE_ACCOUNT_NAMED = /account[ _-]?id|dash\.cloudflare\.com/iu;

const CLOUDFLARE_HOSTNAME =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pages\.dev|workers\.dev|cloudflareaccess\.com)\b/giu;

const SORT_CODE_DIGITS = 6;

const ACCOUNT_DIGITS = 8;

const PAIR_DIGITS = SORT_CODE_DIGITS + ACCOUNT_DIGITS;

const SORT_BOUNDARIES: readonly number[] = [2, 4];

const ACCOUNT_BOUNDARIES: readonly number[] = [4];

const ACCOUNT_DISTANCE = 400;

const CLOCK = /^[0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$/u;

const readsAsTime = (value: string) => CLOCK.test(value.trim());

const ACCOUNT_CONTEXT = 3;

const unescaped = (text: string) => text.replaceAll(/\\[nrtbfv0]/gu, "  ");

const EXAMPLE_HOSTNAMES = new Set([
  "example.cloudflareaccess.com",
  "example.pages.dev",
  "example.workers.dev",
]);

const CONFIG_FILE = /\.(?:env|json|jsonc|toml|ya?ml)$/u;

const ADVICE: Record<RuleId, string> = {
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
  readonly lineAt: (position: number) => number;
  readonly rawOf: (start: number, end: number) => string;
  readonly text: string;
}

const rawSource = (text: string): TextSource => {
  const starts = lineStartsOf(text.split("\n"));

  return {
    lineAt: (position) => lineIndexOf(starts, position),
    rawOf: (start, end) => text.slice(start, end),
    text,
  };
};

const decodedSource = (text: string): TextSource => {
  const starts = lineStartsOf(text.split("\n"));

  const { origins, text: decodedText } = decodeText(text);

  return {
    lineAt: (position) => lineIndexOf(starts, origins?.[position] ?? position),
    rawOf: (start, end) =>
      text.slice(origins?.[start] ?? start, (origins?.[end - 1] ?? end) + 1),
    text: decodedText,
  };
};

interface Span {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

const ibanSpansFrom = (
  text: string,
  start: number,
  end: number
): readonly Span[] => {
  const spans: Span[] = [];

  for (let cursor = start; cursor < end; cursor += 1) {
    const character = text[cursor] ?? "";

    if (!ALNUM.test(character)) {
      continue;
    }

    if (
      cursor > start &&
      SEPARATOR_CODE[text.codePointAt(cursor - 1) ?? 0] !== 1
    ) {
      continue;
    }

    const compact: string[] = [];

    const offsets: number[] = [];

    for (
      let scan = cursor;
      scan < end && compact.length <= IBAN_MAX_LENGTH;
      scan += 1
    ) {
      if (SEPARATOR_CODE[text.codePointAt(scan) ?? 0] === 1) {
        continue;
      }

      compact.push(text[scan] ?? "");

      offsets.push(scan);
    }

    const length = IBAN_LENGTHS.get(compact.slice(0, 2).join("").toUpperCase());

    if (length === undefined || compact.length < length) {
      continue;
    }

    if (!IBAN_HEAD.test(compact.slice(0, 4).join(""))) {
      continue;
    }

    const bodyEnd = (offsets[length - 1] ?? cursor) + 1;

    const after = text[bodyEnd] ?? "";

    if (after !== "" && ALNUM.test(after)) {
      continue;
    }

    const span = {
      end: bodyEnd,
      start: cursor,
      text: text.slice(cursor, bodyEnd),
    };

    if (readsAsIban(span.text)) {
      spans.push(span);
    }
  }

  return spans;
};

const ibanSpans = (source: TextSource): readonly Span[] => {
  const text = unescaped(source.text);

  return [...text.matchAll(IBAN_RUN)].flatMap((match) => {
    const run = match[0].replaceAll(SEPARATOR_EDGES, "");

    if (run.length === 0) {
      return [];
    }

    const start = (match.index ?? 0) + match[0].indexOf(run);

    const end = start + run.length;

    if (
      IBAN_EDGE.test(text[start - 1] ?? "") ||
      IBAN_EDGE.test(text[end] ?? "")
    ) {
      return [];
    }

    return ibanSpansFrom(text, start, end);
  });
};

interface RunDigit {
  readonly end: number;
  readonly separated: boolean;
  readonly start: number;
}

interface BankAtom {
  readonly end: number;
  readonly start: number;
}

interface BankAtoms {
  readonly accounts: readonly BankAtom[];
  readonly sortCodes: readonly BankAtom[];
}

const runDigitsOf = (
  text: string,
  start: number,
  end: number
): readonly RunDigit[] => {
  const digits: RunDigit[] = [];

  for (let cursor = start; cursor < end; cursor += 1) {
    if (!DIGIT.test(text[cursor] ?? "")) {
      continue;
    }

    digits.push({
      end: cursor + 1,
      separated:
        cursor > start &&
        SEPARATOR_CODE[text.codePointAt(cursor - 1) ?? 0] === 1,
      start: cursor,
    });
  }

  return digits;
};

const splitsOnlyAt = (
  digits: readonly RunDigit[],
  from: number,
  count: number,
  boundaries: readonly number[]
) => {
  for (let offset = 1; offset < count; offset += 1) {
    if (
      digits[from + offset]?.separated === true &&
      !boundaries.includes(offset)
    ) {
      return false;
    }
  }

  return true;
};

const atomAt = (
  digits: readonly RunDigit[],
  from: number,
  count: number
): BankAtom => ({
  end: digits[from + count - 1]?.end ?? 0,
  start: digits[from]?.start ?? 0,
});

const readsAsSortCode = (digits: readonly RunDigit[], from: number) =>
  from + SORT_CODE_DIGITS <= digits.length &&
  splitsOnlyAt(digits, from, SORT_CODE_DIGITS, SORT_BOUNDARIES);

const readsAsAccount = (digits: readonly RunDigit[], from: number) =>
  from + ACCOUNT_DIGITS <= digits.length &&
  splitsOnlyAt(digits, from, ACCOUNT_DIGITS, ACCOUNT_BOUNDARIES);

const bankAtomsOf = (text: string): BankAtoms => {
  const accounts: BankAtom[] = [];

  const sortCodes: BankAtom[] = [];

  for (const match of text.matchAll(NUMBER_RUN)) {
    const run = match[0].replaceAll(SEPARATOR_EDGES, "");

    if (run.length === 0) {
      continue;
    }

    const start = (match.index ?? 0) + match[0].indexOf(run);

    const end = start + run.length;

    if (
      TOKEN_EDGE.test(text[start - 1] ?? "") ||
      TOKEN_EDGE.test(text[end] ?? "")
    ) {
      continue;
    }

    const digits = runDigitsOf(text, start, end);

    if (
      digits.length === SORT_CODE_DIGITS &&
      splitsOnlyAt(digits, 0, SORT_CODE_DIGITS, SORT_BOUNDARIES)
    ) {
      sortCodes.push(atomAt(digits, 0, SORT_CODE_DIGITS));

      continue;
    }

    if (
      digits.length === ACCOUNT_DIGITS &&
      splitsOnlyAt(digits, 0, ACCOUNT_DIGITS, ACCOUNT_BOUNDARIES)
    ) {
      accounts.push(atomAt(digits, 0, ACCOUNT_DIGITS));

      continue;
    }

    if (digits.length !== PAIR_DIGITS) {
      continue;
    }

    if (
      readsAsSortCode(digits, 0) &&
      readsAsAccount(digits, SORT_CODE_DIGITS)
    ) {
      sortCodes.push(atomAt(digits, 0, SORT_CODE_DIGITS));

      accounts.push(atomAt(digits, SORT_CODE_DIGITS, ACCOUNT_DIGITS));
    }

    if (readsAsAccount(digits, 0) && readsAsSortCode(digits, ACCOUNT_DIGITS)) {
      accounts.push(atomAt(digits, 0, ACCOUNT_DIGITS));

      sortCodes.push(atomAt(digits, ACCOUNT_DIGITS, SORT_CODE_DIGITS));
    }
  }

  return { accounts, sortCodes };
};

const inside = (span: BankAtom, spans: readonly Span[]) =>
  spans.some(
    (candidate) => candidate.start <= span.start && span.end <= candidate.end
  );

const bankFindings = (
  filePath: string,
  source: TextSource,
  allow: AllowList,
  ibans: readonly Span[]
): readonly PersonalDataFinding[] => {
  const { accounts, sortCodes } = bankAtomsOf(source.text);

  const allowed = accounts.filter(
    (account) =>
      !inside(account, ibans) &&
      !allowsValue(
        allow,
        filePath,
        source.text.slice(account.start, account.end)
      )
  );

  if (allowed.length === 0) {
    return [];
  }

  const findings = sortCodes.flatMap((sortCode) => {
    if (
      inside(sortCode, ibans) ||
      readsAsTime(source.rawOf(sortCode.start, sortCode.end)) ||
      allowsValue(
        allow,
        filePath,
        source.text.slice(sortCode.start, sortCode.end)
      )
    ) {
      return [];
    }

    const sorted = allowed.filter(
      (account) =>
        account.end >= sortCode.start - ACCOUNT_DISTANCE &&
        account.start <= sortCode.end + ACCOUNT_DISTANCE
    );

    return sorted.length === 0
      ? []
      : [
          {
            file: filePath,
            line: source.lineAt(sortCode.start) + 1,
            rule: "bank-account" as const,
          },
        ];
  });

  return findings;
};

const ibanFindings = (
  filePath: string,
  spans: readonly Span[],
  source: TextSource,
  allow: AllowList
): readonly PersonalDataFinding[] =>
  spans.flatMap((span) =>
    allowsValue(allow, filePath, span.text)
      ? []
      : [
          {
            file: filePath,
            line: source.lineAt(span.start) + 1,
            rule: "iban" as const,
          },
        ]
  );

const emailFindings = (
  filePath: string,
  source: TextSource,
  allow: AllowList
): readonly PersonalDataFinding[] =>
  [...unescaped(source.text).matchAll(EMAIL)].flatMap((match) => {
    const [address] = match;

    if (address === undefined || allowsEmail(allow, filePath, address)) {
      return [];
    }

    return [
      {
        file: filePath,
        line: source.lineAt(match.index ?? 0) + 1,
        rule: "email" as const,
      },
    ];
  });

const hostnameFindings = (
  filePath: string,
  source: TextSource,
  allow: AllowList
): readonly PersonalDataFinding[] =>
  [...source.text.matchAll(CLOUDFLARE_HOSTNAME)].flatMap((match) => {
    const [hostname] = match;

    if (
      hostname === undefined ||
      isExampleHostname(hostname) ||
      allowsValue(allow, filePath, hostname)
    ) {
      return [];
    }

    return [
      {
        file: filePath,
        line: source.lineAt(match.index ?? 0) + 1,
        rule: "cloudflare-hostname" as const,
      },
    ];
  });

const accountIdFindings = (
  filePath: string,
  lines: readonly string[],
  allow: AllowList
): readonly PersonalDataFinding[] =>
  lines.flatMap((line, index) => {
    if (!isConfigFile(filePath) && !namesAccount(lines, index, line)) {
      return [];
    }

    return [...line.matchAll(CLOUDFLARE_ACCOUNT_ID)].flatMap((match) => {
      const [value] = match;

      if (value === undefined || allowsValue(allow, filePath, value)) {
        return [];
      }

      return [
        {
          file: filePath,
          line: index + 1,
          rule: "cloudflare-account-id" as const,
        },
      ];
    });
  });

const BLOCK_SCALAR_KEY =
  /^[ \t]*(?:-[ \t]+)?[A-Za-z0-9_.-]*(?:token|secret|password|passwd|api[_-]?key)[A-Za-z0-9_.-]*[ \t]*:[ \t]*[|>][-+]?[ \t]*$/iu;

const BLOCK_SCALAR_TOKEN =
  /^[ \t]+(?<quote>["'`])?(?<token>[A-Za-z0-9_\-+=]{24,})\k<quote>[ \t]*$/u;

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
  LETTER.test(value) &&
  entropyOf(value) >= BLOCK_SCALAR_ENTROPY;

const blockScalarFindings = (
  filePath: string,
  lines: readonly string[],
  allow: AllowList
): readonly PersonalDataFinding[] => {
  const findings: PersonalDataFinding[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!BLOCK_SCALAR_KEY.test(line)) {
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

const sourceFindings = (
  filePath: string,
  source: TextSource,
  allow: AllowList
): readonly PersonalDataFinding[] => {
  const ibans = ibanSpans(source);

  return [
    ...ibanFindings(filePath, ibans, source, allow),
    ...emailFindings(filePath, source, allow),
    ...hostnameFindings(filePath, source, allow),
    ...bankFindings(filePath, source, allow, ibans),
  ];
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

  return uniqueFindings([
    ...accountIdFindings(filePath, text.split("\n"), allow),
    ...blockScalarFindings(filePath, text.split("\n"), allow),
    ...sourceFindings(filePath, rawSource(text), allow),
    ...sourceFindings(filePath, decodedSource(text), allow),
  ]);
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
