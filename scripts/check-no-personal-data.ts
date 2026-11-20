// @effect-diagnostics nodeBuiltinImport:off -- This guard reads every tracked file through Git and the file system.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const root = path.resolve(import.meta.dirname, "..");

export const RULE_IDS = [
  "bank-account",
  "cloudflare-account-id",
  "cloudflare-hostname",
  "email",
  "iban",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

const SchemaSkipped = Schema.Struct({
  path: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
});

const SchemaEntry = Schema.Struct({
  column: Schema.optional(Schema.NonEmptyString),
  path: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  value: Schema.NonEmptyString,
});

const SchemaAllowList = Schema.Struct({
  skipped: Schema.Array(SchemaSkipped),
  values: Schema.Array(SchemaEntry),
});

export type SkippedEntry = Schema.Schema.Type<typeof SchemaSkipped>;

export type AllowEntry = Schema.Schema.Type<typeof SchemaEntry>;

export type AllowList = Schema.Schema.Type<typeof SchemaAllowList>;

export interface PersonalDataFinding {
  readonly file: string;
  readonly line: number;
  readonly rule: RuleId;
}

export const decodeAllowList = Schema.decodeUnknownSync(
  Schema.fromJsonString(SchemaAllowList)
);

const RESERVED_DOMAINS = "example.com example.net example.org".split(" ");

const RESERVED_SUFFIXES = [".example", ".invalid", ".localhost", ".test"];

const NO_REPLY = new Set(["noreply@anthropic.com", "noreply@github.com"]);

const EXAMPLE_HOSTNAMES =
  "example.cloudflareaccess.com example.pages.dev example.workers.dev".split(
    " "
  );

const EMAIL =
  /(?:"[^"\\<>()[\]{}|@]{0,63}[\p{L}\p{N}]"|[\p{L}\p{N}][\p{L}\p{M}\p{N}._%+'’-]*)@(?:[\p{L}\p{N}\p{M}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?\.)+[\p{L}\p{M}]{2,}/gu;

const HOSTNAME =
  /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:pages\.dev|workers\.dev|cloudflareaccess\.com)\b/giu;

const ACCOUNT_ID = /\b[0-9a-f]{32}\b/iu;

const ACCOUNT_ID_NAMED = /account[ _-]?id|dash\.cloudflare\.com/iu;

const ACCOUNT_WORD = /account/iu;

const CONFIG_FILE = /\.(?:env|json|jsonc|toml|ya?ml)$/u;

const SORT_CODE = /(?<![0-9])[0-9]{2}[-. ][0-9]{2}[-. ][0-9]{2}(?![0-9])/u;

const ACCOUNT_NUMBER = /(?<![0-9])[0-9]{8}(?![0-9])/u;

const BANK_WORD = /(?:sort|account)/iu;

const IBAN_RUN =
  /(?<![\p{L}\p{N}])[\p{L}]{2}[0-9]{2}(?:[ -]?[\p{L}\p{N}]){11,30}(?![\p{L}\p{N}])/gu;

const IBAN_TABLE =
  "AD24 AE23 AL28 AT20 AZ28 BA20 BE16 BG22 BH22 BI27 BR29 BY28 CH21 CR22 CY28 CZ24 DE22 DJ27 DK18 DO28 EE20 EG29 ES24 FI18 FK18 FO18 FR27 GB22 GE22 GI23 GL18 GR27 GT28 HR21 HU28 IE22 IL23 IQ23 IS26 IT27 JO30 KW30 KZ20 LB28 LC32 LI21 LT20 LU20 LV21 LY25 MC27 MD24 ME22 MK19 MN20 MR27 MT31 MU30 NI28 NL18 NO15 OM23 PK24 PL28 PS29 PT25 QA29 RO24 RS22 RU33 SA24 SC31 SD18 SE24 SI19 SK24 SM27 SO23 ST25 SV28 TL23 TN24 TR26 UA29 VA22 VG24 XK20 YE30";

const IBAN_LENGTHS = new Map(
  IBAN_TABLE.split(" ").map((entry): [string, number] => [
    entry.slice(0, 2),
    Number(entry.slice(2)),
  ])
);

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

const passesIbanChecksum = (value: string) => {
  const digits = `${value.slice(4)}${value.slice(0, 4)}`
    .toUpperCase()
    .replaceAll(/[A-Z]/gu, (letter) =>
      String((letter.codePointAt(0) ?? 0) - 55)
    );

  return BigInt(digits) % 97n === 1n;
};

const ibanIn = (line: string) =>
  [...line.matchAll(IBAN_RUN)].some((match) => {
    const value = match[0].replaceAll(/[ -]/gu, "").toUpperCase();
    const length = IBAN_LENGTHS.get(value.slice(0, 2));
    const candidate = value.slice(0, length ?? 0);
    const body = candidate.slice(4);

    return (
      length !== undefined &&
      body.length === length - 4 &&
      body.replaceAll(/\p{L}/gu, "").length >
        body.replaceAll(/[^\p{L}]/gu, "").length &&
      passesIbanChecksum(candidate)
    );
  });

const allowsValue = (allow: AllowList, file: string, value: string) =>
  allow.values.some(
    (entry) =>
      entry.column === undefined &&
      entry.path === file &&
      entry.value.toLowerCase() === value.toLowerCase()
  );

const allowsEmail = (allow: AllowList, file: string, address: string) => {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();

  return (
    RESERVED_DOMAINS.includes(domain) ||
    RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix)) ||
    NO_REPLY.has(address.toLowerCase()) ||
    domain === "users.noreply.github.com" ||
    allowsValue(allow, file, address)
  );
};

export const isSkippedPath = (filePath: string, allow: AllowList) =>
  allow.skipped.some((entry) => entry.path === filePath);

const bankPair = (window: string) =>
  BANK_WORD.test(window) &&
  SORT_CODE.test(window) &&
  ACCOUNT_NUMBER.test(window);

export const findPersonalData = (
  file: string,
  text: string,
  allow: AllowList
): readonly PersonalDataFinding[] => {
  if (isSkippedPath(file, allow)) {
    return [];
  }

  const lines = text.split("\n").map((line) => line.replace(/\r$/u, ""));

  const configFile = CONFIG_FILE.test(file);

  return lines.flatMap((line, index) => {
    const at = index + 1;
    const window = `${line}\n${lines[index + 1] ?? ""}`;

    const namesAccount =
      ACCOUNT_ID_NAMED.test(line) || (configFile && ACCOUNT_WORD.test(line));

    const verdicts: readonly (readonly [RuleId, boolean])[] = [
      ["bank-account", bankPair(window)],
      ["cloudflare-account-id", ACCOUNT_ID.test(line) && namesAccount],
      [
        "cloudflare-hostname",
        [...line.matchAll(HOSTNAME)].some(
          (match) =>
            !EXAMPLE_HOSTNAMES.includes(match[0].toLowerCase()) &&
            !allowsValue(allow, file, match[0])
        ),
      ],
      [
        "email",
        [...line.matchAll(EMAIL)].some(
          (match) => !allowsEmail(allow, file, match[0])
        ),
      ],
      ["iban", ibanIn(line)],
    ];

    return verdicts.flatMap(([rule, flagged]) =>
      flagged ? [{ file, line: at, rule }] : []
    );
  });
};

export const findingMessage = (finding: PersonalDataFinding) =>
  `${finding.file}:${finding.line}: ${ADVICE[finding.rule]}`;

const trackedFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf-8" })
    .split("\u0000")
    .filter((file) => file.length > 0);

const run = () => {
  const allow = decodeAllowList(
    readFileSync(`${root}/scripts/no-personal-data-allow.json`, "utf-8")
  );

  const argv = process.argv.slice(2);
  const files = argv.length > 0 ? argv : trackedFiles();

  const findings = files.flatMap((file) => {
    const bytes = readFileSync(path.resolve(root, file));

    return bytes.includes(0)
      ? []
      : findPersonalData(file, bytes.toString("utf-8"), allow);
  });

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
