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

const IBAN_COUNTRY_CODES = [
  "AD",
  "AE",
  "AL",
  "AT",
  "AZ",
  "BA",
  "BE",
  "BG",
  "BH",
  "BI",
  "BR",
  "BY",
  "CH",
  "CR",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DO",
  "EE",
  "EG",
  "ES",
  "FI",
  "FK",
  "FO",
  "FR",
  "GB",
  "GE",
  "GI",
  "GL",
  "GR",
  "GT",
  "HR",
  "HU",
  "IE",
  "IL",
  "IQ",
  "IS",
  "IT",
  "JO",
  "KW",
  "KZ",
  "LB",
  "LC",
  "LI",
  "LT",
  "LU",
  "LV",
  "LY",
  "MC",
  "MD",
  "ME",
  "MK",
  "MN",
  "MR",
  "MT",
  "MU",
  "NI",
  "NL",
  "NO",
  "OM",
  "PK",
  "PL",
  "PS",
  "PT",
  "QA",
  "RO",
  "RS",
  "RU",
  "SA",
  "SC",
  "SD",
  "SE",
  "SI",
  "SK",
  "SM",
  "SO",
  "ST",
  "SV",
  "TL",
  "TN",
  "TR",
  "UA",
  "VA",
  "VG",
  "XK",
  "YE",
] as const;

const IBAN = new RegExp(
  `\\b(?:${IBAN_COUNTRY_CODES.join("|")})\\d{2}(?:[A-Z0-9]{11,30}|(?: [A-Z0-9]{4}){2,7}(?: [A-Z0-9]{1,3})?)\\b`,
  "giu"
);

const EMAIL =
  /(?<!\\)\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gu;

const CLOUDFLARE_ACCOUNT_ID = /\b[0-9a-f]{32}\b/giu;

const CLOUDFLARE_ACCOUNT_NAMED = /account[ _-]?id|dash\.cloudflare\.com/iu;

const CLOUDFLARE_HOSTNAME =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pages\.dev|workers\.dev|cloudflareaccess\.com)\b/giu;

const SORT_CODE =
  /\b(?:\d{6}|\d{2}(?<separator>[-.–— ])\d{2}\k<separator>\d{2})\b/gu;

const ACCOUNT_NUMBER = /\b\d{4}[ -]?\d{4}\b/gu;

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

const isExampleHostname = (hostname: string) => {
  const name = hostname.toLowerCase();

  return name === "example" || name.startsWith("example.");
};

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

const bankAccountFindings = (
  filePath: string,
  lines: readonly string[],
  allow: AllowList
): readonly PersonalDataFinding[] => {
  const dense = denseLines(lines);

  return dense.flatMap((entry, position) => {
    const [sortCode] = matchesIn(SORT_CODE, entry.text);

    if (sortCode === undefined) {
      return [];
    }

    const accountNumber = dense
      .slice(Math.max(position - 1, 0), position + 2)
      .flatMap((neighbour) => matchesIn(ACCOUNT_NUMBER, neighbour.text))
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
        ...matchesIn(EMAIL, line)
          .filter((address) => !allowsEmail(allow, filePath, address))
          .map(() => "email" as const),
        ...matchesIn(CLOUDFLARE_HOSTNAME, line)
          .filter(
            (hostname) =>
              !isExampleHostname(hostname) &&
              !allowsValue(allow, filePath, hostname)
          )
          .map(() => "cloudflare-hostname" as const),
        ...(isConfigFile(filePath) || CLOUDFLARE_ACCOUNT_NAMED.test(line)
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
