// @effect-diagnostics nodeBuiltinImport:off -- This guard reads every tracked file through Git and the file system.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Option, Schema } from "effect";

const root = path.resolve(import.meta.dirname, "..");

const allowListPath = "scripts/no-personal-data-allow.json";

export type RuleId =
  | "bank-account"
  | "cloudflare-account-id"
  | "cloudflare-hostname"
  | "email"
  | "iban";

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

const SEPARATOR = String.raw`\t\v\f \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF\u2010-\u2015.-`;

const SEPARATOR_ANY = `[${SEPARATOR}]*`;

const IBAN_LENGTHS = {
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
};

const ibanGroupSizes = (length: number) => {
  const sizes = Array.from({ length: Math.floor(length / 4) }, () => 4);

  const tail = length % 4;

  return tail > 0 ? [...sizes, tail] : sizes;
};

const ibanBranch = ([country, length]: readonly [string, number]) => {
  const [, ...groups] = ibanGroupSizes(length).map(
    (size) => `[A-Z0-9]{${size}}`
  );

  return `${country}${SEPARATOR_ANY}\\d{2}${SEPARATOR_ANY}${groups.join(SEPARATOR_ANY)}`;
};

const IBAN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${Object.entries(IBAN_LENGTHS).map(ibanBranch).join("|")})(?![A-Z0-9])`,
  "giu"
);

const EMAIL =
  /(?:"[^"\\\s]{1,64}"|[\p{L}\p{N}][\p{L}\p{N}._%+'’-]*)@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,}/gu;

const CLOUDFLARE_ACCOUNT_ID = /\b[0-9a-f]{32}\b/giu;

const CLOUDFLARE_ACCOUNT_NAMED = /account[ _-]?id|dash\.cloudflare\.com/iu;

const CLOUDFLARE_HOSTNAME =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pages\.dev|workers\.dev|cloudflareaccess\.com)\b/giu;

const SORT_CODE = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:\\d{6}|\\d{2}[${SEPARATOR}]*\\d{2}[${SEPARATOR}]*\\d{2})(?![\\p{L}\\p{N}_])(?![${SEPARATOR}]*\\d)`,
  "gu"
);

const ACCOUNT_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:\\d{8}|\\d{4}[${SEPARATOR}]*\\d{4})(?![\\p{L}\\p{N}_])(?![${SEPARATOR}]*\\d)`,
  "gu"
);

const ACCOUNT_DISTANCE = 400;

const ACCOUNT_CONTEXT = 3;

const unescaped = (text: string) => text.replaceAll(/\\[nrtbfv0]/gu, " ");

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

const matchesIn = (pattern: RegExp, line: string): readonly string[] =>
  [...line.matchAll(pattern)].flatMap((match) =>
    Option.match(Option.fromUndefinedOr(match[0]), {
      onNone: () => [],
      onSome: (value) => [value],
    })
  );

const denseLines = (lines: readonly string[]) =>
  lines.flatMap((text, index) =>
    text.trim().length === 0 ? [] : [{ index, text }]
  );

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

const namesAccount = (lines: readonly string[], index: number) =>
  [lines[index] ?? "", ...previousTexts(lines, index, ACCOUNT_CONTEXT)].some(
    (text) => CLOUDFLARE_ACCOUNT_NAMED.test(text)
  );

interface DenseLine {
  readonly index: number;
  readonly text: string;
}

const textsWithinReach = (
  dense: readonly DenseLine[],
  position: number
): readonly string[] => {
  const texts: string[] = [];

  let budget = ACCOUNT_DISTANCE;

  for (
    let cursor = position;
    cursor < dense.length && budget > 0;
    cursor += 1
  ) {
    const text = dense[cursor]?.text ?? "";

    texts.push(text);

    budget -= text.length;
  }

  budget = ACCOUNT_DISTANCE;

  for (let cursor = position - 1; cursor >= 0 && budget > 0; cursor -= 1) {
    const text = dense[cursor]?.text ?? "";

    texts.push(text);

    budget -= text.length;
  }

  return texts;
};

const bankAccountFindings = (
  filePath: string,
  lines: readonly string[],
  allow: AllowList
): readonly PersonalDataFinding[] => {
  const dense: readonly DenseLine[] = denseLines(lines);

  return dense.flatMap((entry, position) => {
    const [sortCode] = matchesIn(SORT_CODE, entry.text);

    if (sortCode === undefined) {
      return [];
    }

    const accountNumber = textsWithinReach(dense, position)
      .flatMap((text) => matchesIn(ACCOUNT_NUMBER, text))
      .find((candidate) => !allowsValue(allow, filePath, candidate));

    return accountNumber === undefined
      ? []
      : [
          {
            file: filePath,
            line: entry.index + 1,
            rule: "bank-account" as const,
          },
        ];
  });
};

export const findPersonalData = (
  filePath: string,
  text: string,
  allow: AllowList
): readonly PersonalDataFinding[] => {
  if (isSkippedPath(filePath, allow)) {
    return [];
  }

  const lines = text.split("\n");

  const lineFindings = lines.flatMap(
    (line, index): readonly PersonalDataFinding[] => {
      const found: readonly RuleId[] = [
        ...matchesIn(IBAN, line)
          .filter((value) => !allowsValue(allow, filePath, value))
          .map(() => "iban" as const),
        ...matchesIn(EMAIL, unescaped(line))
          .filter((address) => !allowsEmail(allow, filePath, address))
          .map(() => "email" as const),
        ...matchesIn(CLOUDFLARE_HOSTNAME, line)
          .filter(
            (hostname) =>
              !isExampleHostname(hostname) &&
              !allowsValue(allow, filePath, hostname)
          )
          .map(() => "cloudflare-hostname" as const),
        ...(isConfigFile(filePath) || namesAccount(lines, index)
          ? matchesIn(CLOUDFLARE_ACCOUNT_ID, line)
              .filter((value) => !allowsValue(allow, filePath, value))
              .map(() => "cloudflare-account-id" as const)
          : []),
      ];

      return found.map((rule) => ({ file: filePath, line: index + 1, rule }));
    }
  );

  return [...lineFindings, ...bankAccountFindings(filePath, lines, allow)];
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
