// @effect-diagnostics nodeBuiltinImport:off -- This test reads the repository's lint config, package manifests, and tracked source files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import type {
  AllowWarnDeny,
  DummyRule,
  OxlintConfig,
  OxlintOverride,
} from "oxlint";
import { describe, expect, it } from "vitest";

import lintConfig from "../oxlint.config.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

type Severity = "off" | "warn" | "error";

type RuleScope =
  | { readonly kind: "global" }
  | {
      readonly kind: "files";
      readonly files: readonly string[];
      readonly excludeFiles?: readonly string[];
    };

interface AllowlistEntry {
  readonly reason: string;
  readonly scopes: readonly RuleScope[];
}

const globalScope: RuleScope = { kind: "global" };

const foldkitTestFiles = [
  "apps/web/src/**/*.test.ts",
  "apps/web/src/**/*.test.tsx",
  "apps/web/src/**/*.spec.ts",
  "apps/web/src/**/*.spec.tsx",
] as const;

const foldkitTestScope: RuleScope = {
  kind: "files",
  files: foldkitTestFiles,
};

const sourceExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
] as const;

const sourceExtensionSet: ReadonlySet<string> = new Set(sourceExtensions);

const extensionAlternatives = sourceExtensions
  .map((extension) => extension.slice(1))
  .join(",");

const isSourceExtension = (file: string): boolean =>
  sourceExtensionSet.has(path.extname(file));

const testFileGlobs: readonly string[] = [
  `**/*.{test,spec,test-d,spec-d}.{${extensionAlternatives}}`,
  `**/__tests__/**/*.{${extensionAlternatives}}`,
];

const testFilesScope: RuleScope = { kind: "files", files: testFileGlobs };

const foldkitProgramReason =
  "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.";

const foldkitTestOnly: AllowlistEntry = {
  reason: foldkitProgramReason,
  scopes: [foldkitTestScope],
};

type Allowlist = Readonly<Record<string, AllowlistEntry>>;

const offRuleAllowlist = {
  "foldkit/command-binding-matches-name": foldkitTestOnly,
  "foldkit/command-define-pascal-const": foldkitTestOnly,
  "foldkit/got-prefix-requires-submodel-payload": foldkitTestOnly,
  "foldkit/got-submodel-message-name": foldkitTestOnly,
  "foldkit/got-wrapper-carries-only-routing": foldkitTestOnly,
  "foldkit/keyed-required-for-mapped-rows": foldkitTestOnly,
  "foldkit/lazy-view-stable-references": foldkitTestOnly,
  "foldkit/mount-factory-must-use-element": foldkitTestOnly,
  "foldkit/no-array-index-view-keys": foldkitTestOnly,
  "foldkit/no-child-message-construction-in-root": foldkitTestOnly,
  "foldkit/no-direct-submodel-state-update": foldkitTestOnly,
  "foldkit/no-disabling-dev-guardrails": foldkitTestOnly,
  "foldkit/no-duplicate-onmount-per-element": foldkitTestOnly,
  "foldkit/no-empty-children-array": foldkitTestOnly,
  "foldkit/no-empty-commands-array": foldkitTestOnly,
  "foldkit/no-empty-object-tagged-call": foldkitTestOnly,
  "foldkit/no-empty-to-parent-out-message": foldkitTestOnly,
  "foldkit/no-hand-rolled-command-struct": foldkitTestOnly,
  "foldkit/no-hardcoded-route-strings": foldkitTestOnly,
  "foldkit/no-impure-call-at-decision-time": {
    reason:
      "Foldkit entry modules read the environment while starting up, so the rule would report the one place those reads belong.",
    scopes: [
      {
        kind: "files",
        files: [
          "apps/web/src/**/entry.server.ts",
          "apps/web/src/**/entry.server.tsx",
          "apps/web/src/**/server/**/*.ts",
          "apps/web/src/**/server/**/*.tsx",
          "apps/web/src/**/prerender.ts",
          "apps/web/src/**/prerender.tsx",
        ],
        excludeFiles: foldkitTestFiles,
      },
      {
        kind: "files",
        files: [
          "apps/web/src/**/entry.ts",
          "apps/web/src/**/entry.tsx",
          "apps/web/src/**/entry.client.ts",
          "apps/web/src/**/entry.client.tsx",
          "apps/web/src/**/entry.server.ts",
          "apps/web/src/**/entry.server.tsx",
        ],
        excludeFiles: foldkitTestFiles,
      },
      foldkitTestScope,
    ],
  },
  "foldkit/no-module-level-mutable-state": foldkitTestOnly,
  "foldkit/no-nonportable-server-globals": {
    reason:
      "The web app keeps browser and server modules in one source tree, so the server-globals check would fire on browser code.",
    scopes: [
      { kind: "files", files: ["apps/web/src/**/*.ts"] },
      foldkitTestScope,
    ],
  },
  "foldkit/no-noop-message": foldkitTestOnly,
  "foldkit/no-prevent-default-in-stream-operator": foldkitTestOnly,
  "foldkit/no-raw-dom-event-attributes": foldkitTestOnly,
  "foldkit/no-route-query-constructor-default": foldkitTestOnly,
  "foldkit/no-spread-in-modify-fields": foldkitTestOnly,
  "foldkit/prefer-callable-message-constructor": foldkitTestOnly,
  "foldkit/prefer-command-mapmessage": foldkitTestOnly,
  "foldkit/prefer-option-over-nullable-in-model": foldkitTestOnly,
  "foldkit/require-fold-for-child-update-result": foldkitTestOnly,
  "foldkit/require-rel-for-external-link": foldkitTestOnly,
  "foldkit/selection-submodel-factory-at-module-scope": foldkitTestOnly,
  "foldkit/wrap-child-output-in-got-message": foldkitTestOnly,
  "jsdoc/require-param-description": {
    reason:
      "Plain JS files keep JSDoc blocks made only of type tags, so a parameter has no prose description to require.",
    scopes: [globalScope],
  },
  "jsdoc/require-returns-description": {
    reason:
      "Plain JS files keep JSDoc blocks made only of type tags, so a return value has no prose description to require.",
    scopes: [globalScope],
  },
  "promise/prefer-await-to-then": {
    reason:
      "Test files build promise-shaped doubles and request fixtures that the name-based check misreads.",
    scopes: [testFilesScope],
  },
  "typescript/promise-function-async": {
    reason:
      "It demands async on every promise-returning callback, and Effect handlers and platform methods return promises without it.",
    scopes: [globalScope],
  },
  "unicorn/throw-new-error": {
    reason:
      "Schema.TaggedError construction looks like a thrown value to the rule.",
    scopes: [globalScope],
  },
} satisfies Allowlist;

const fenceRuleNames = [
  "no-comments/directive-reason",
  "no-comments/no-comments",
  "no-inline-comments",
] as const;

const ignoredScanPrefixes = ["tools/oxlint/anti-slop/", ".brain/"];

const quotedDirectiveFixtures = new Set([
  "apps/site/test/content.test.ts",
  "packages/core/test/no-comments-rule.test.ts",
]);

const commentPattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;

const directivePattern =
  /^(?:(?:oxlint|eslint)-disable(?:-next-line|-line)?|@ts-(?:expect-error|ignore|nocheck)|trufflehog:ignore)\b/u;

const typeDirectivePattern = /^@ts-(?:expect-error|ignore|nocheck)\b/u;

const rationalePattern = /\s--\s+\S/u;

const PackageManifest = Schema.fromJsonString(
  Schema.Struct({
    scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  })
);

const emptyRules: OxlintConfig["rules"] = {};

const severityBySpelling = new Map<AllowWarnDeny, Severity>([
  [0, "off"],
  [1, "warn"],
  [2, "error"],
  ["off", "off"],
  ["allow", "off"],
  ["warn", "warn"],
  ["error", "error"],
  ["deny", "error"],
]);

const severityOfSpelling = (spelling: AllowWarnDeny): Severity => {
  const severity = severityBySpelling.get(spelling);

  if (severity === undefined) {
    throw new Error(
      `Oxlint severity ${String(spelling)} is not 0, 1, 2, off, allow, warn, error, or deny. Fix: normalise the new spelling in severityBySpelling in scripts/lint-fence.test.ts.`
    );
  }

  return severity;
};

const normalizeSeverity = (
  setting: DummyRule | undefined
): Severity | "unset" => {
  if (setting === undefined) {
    return "unset";
  }

  return severityOfSpelling(Array.isArray(setting) ? setting[0] : setting);
};

const rulesOf = (
  rules: OxlintConfig["rules"]
): readonly (readonly [string, DummyRule | undefined])[] =>
  Object.entries(rules ?? emptyRules);

const scopeOfOverride = (override: OxlintOverride): RuleScope => ({
  kind: "files",
  files: override.files,
  excludeFiles: override.excludeFiles ?? [],
});

const addScope = (
  scopes: Map<string, RuleScope[]>,
  rule: string,
  scope: RuleScope
): void => {
  scopes.set(rule, [...(scopes.get(rule) ?? []), scope]);
};

const offScopes = (
  config: OxlintConfig
): ReadonlyMap<string, readonly RuleScope[]> => {
  const scopes = new Map<string, RuleScope[]>();

  for (const [rule, setting] of rulesOf(config.rules)) {
    if (normalizeSeverity(setting) === "off") {
      addScope(scopes, rule, globalScope);
    }
  }

  for (const override of config.overrides ?? []) {
    for (const [rule, setting] of rulesOf(override.rules)) {
      if (normalizeSeverity(setting) === "off") {
        addScope(scopes, rule, scopeOfOverride(override));
      }
    }
  }

  return scopes;
};

const weakRuleNames = (config: OxlintConfig): readonly string[] =>
  [
    ...new Set([
      ...rulesOf(config.rules).flatMap(([rule, setting]) =>
        normalizeSeverity(setting) === "warn" ? [rule] : []
      ),
      ...(config.overrides ?? []).flatMap((override) =>
        rulesOf(override.rules).flatMap(([rule, setting]) =>
          normalizeSeverity(setting) === "warn" ? [rule] : []
        )
      ),
    ]),
  ].toSorted();

const globKey = (globs: readonly string[]): string =>
  [...new Set(globs)].toSorted().join("\u0000");

const sameScope = (pinned: RuleScope, found: RuleScope): boolean => {
  if (pinned.kind === "global" || found.kind === "global") {
    return pinned.kind === found.kind;
  }

  return (
    globKey(pinned.files) === globKey(found.files) &&
    globKey(pinned.excludeFiles ?? []) === globKey(found.excludeFiles ?? [])
  );
};

const describeScope = (scope: RuleScope): string => {
  if (scope.kind === "global") {
    return "every file (global)";
  }

  const excluded = scope.excludeFiles ?? [];

  return `${scope.files.join(", ")}${excluded.length === 0 ? "" : ` except ${excluded.join(", ")}`}`;
};

const offRuleProblems = (
  config: OxlintConfig,
  allowlist: Allowlist
): readonly string[] =>
  [...offScopes(config)].flatMap(([rule, scopes]) => {
    const pinned = allowlist[rule];

    if (pinned === undefined) {
      return scopes.map(
        (scope) =>
          `${rule} is off for ${describeScope(scope)}, and offRuleAllowlist has no entry for it. Fix: turn ${rule} back on in oxlint.config.ts, or add it to offRuleAllowlist in scripts/lint-fence.test.ts with a reason and the exact scope it may be off for.`
      );
    }

    return scopes.flatMap((scope) =>
      pinned.scopes.some((allowed) => sameScope(allowed, scope))
        ? []
        : [
            `${rule} is off for ${describeScope(scope)}, which the allowlist does not pin (pinned: ${pinned.scopes.map(describeScope).join(" ; ")}). Fix: turn ${rule} back on outside the pinned scope, or record a reason for this wider scope in offRuleAllowlist in scripts/lint-fence.test.ts.`,
          ]
    );
  });

const weakRuleProblems = (config: OxlintConfig): readonly string[] =>
  weakRuleNames(config).map(
    (rule) =>
      `${rule} is set to warn, which lets its findings pass. Fix: set it to error in oxlint.config.ts, or record an explicit off rule with a reason and scope in offRuleAllowlist in scripts/lint-fence.test.ts.`
  );

const ruleFenceProblems = (
  config: OxlintConfig,
  allowlist: Allowlist
): readonly string[] => [
  ...weakRuleProblems(config),
  ...offRuleProblems(config, allowlist),
];

const blockCommentText = (comment: string): string =>
  comment
    .slice(2, -2)
    .split("\n")
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .join(" ")
    .replaceAll(/\s+/gu, " ")
    .trim();

const commentText = (comment: string): string =>
  comment.startsWith("//")
    ? comment.slice(2).trim()
    : blockCommentText(comment);

const hasRationale = (text: string): boolean => {
  const typeDirective = typeDirectivePattern.exec(text);

  if (typeDirective === null) {
    return rationalePattern.test(text);
  }

  const afterDirective = text.slice(typeDirective[0].length).trim();

  return afterDirective !== "" && !/^-+$/u.test(afterDirective);
};

const lineAt = (source: string, offset: number): number =>
  source.slice(0, offset).split("\n").length;

const unreasonedDirectivesIn = (
  file: string,
  source: string
): readonly string[] =>
  [...source.matchAll(commentPattern)].flatMap((match) => {
    const text = commentText(match[0]);

    if (!directivePattern.test(text) || hasRationale(text)) {
      return [];
    }

    return [`${file}:${lineAt(source, match.index ?? 0)} ${text}`];
  });

const unreasonedDirectives = (file: string): readonly string[] =>
  unreasonedDirectivesIn(
    file,
    readFileSync(path.join(repoRoot, file), "utf-8")
  );

const isScannedSource = (file: string): boolean =>
  isSourceExtension(file) &&
  !quotedDirectiveFixtures.has(file) &&
  !ignoredScanPrefixes.some((prefix) => file.startsWith(prefix));

const trackedSourceFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf-8" })
    .split("\0")
    .filter(isScannedSource);

const trackedManifests = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z", "*package.json"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
    .split("\0")
    .filter((file) => file !== "");

const scriptsOf = (file: string): Readonly<Record<string, string>> =>
  Schema.decodeSync(PackageManifest)(
    readFileSync(path.join(repoRoot, file), "utf-8")
  ).scripts ?? {};

const oxlintFlagAllowlist = {
  "--fix": "Fix scripts ask Oxlint to rewrite the findings it can repair.",
  "--format":
    "A script can print findings in the shape its log reader expects.",
  "--type-aware":
    "Type-aware rules only run when the command line asks for them.",
} satisfies Readonly<Record<string, string>>;

const isAllowlistedOxlintFlag = (flag: string): boolean =>
  Object.hasOwn(oxlintFlagAllowlist, flag);

const shellOperators: ReadonlySet<string> = new Set([
  "&&",
  "||",
  ";",
  "|",
  "&",
  ">",
  ">>",
  "<",
]);

const shellTokens = (command: string): readonly string[] =>
  command
    .replaceAll(/["']/gu, " ")
    .split(/\s+/u)
    .filter((word) => word !== "");

const isOxlintBinary = (word: string): boolean =>
  word === "oxlint" || word.endsWith("/oxlint");

const isFlagWord = (word: string): boolean =>
  word.startsWith("-") && word !== "-";

const invocationFlags = (
  tokens: readonly string[],
  start: number
): readonly string[] => {
  const flags: string[] = [];

  for (const word of tokens.slice(start)) {
    if (word === "--" || shellOperators.has(word)) {
      break;
    }

    if (isFlagWord(word)) {
      flags.push(word);
    }
  }

  return flags;
};

const flagNames = (word: string): readonly string[] => {
  const name = word.replace(/[=].*$/u, "");

  if (name.startsWith("--")) {
    return [name];
  }

  const flags: string[] = [];

  for (const letter of name.slice(1)) {
    flags.push(`-${letter}`);
  }

  return flags;
};

const flagProblem = (
  file: string,
  name: string,
  command: string,
  flag: string
): string =>
  `${file} script "${name}" runs \`${command}\`, and oxlint flag ${flag} is not on the fence allowlist. Fix: add ${flag} to oxlintFlagAllowlist in scripts/lint-fence.test.ts with a reason for why it cannot hide a finding, or remove it from the script.`;

const scriptFlagProblems = (
  file: string,
  scripts: Readonly<Record<string, string>>
): readonly string[] =>
  Object.entries(scripts).flatMap(([name, command]) => {
    const tokens = shellTokens(command);

    return tokens.flatMap((word, index) =>
      isOxlintBinary(word)
        ? invocationFlags(tokens, index + 1).flatMap((flagWord) =>
            flagNames(flagWord).flatMap((flag) =>
              isAllowlistedOxlintFlag(flag)
                ? []
                : [flagProblem(file, name, command, flag)]
            )
          )
        : []
    );
  });

const allScriptFlagProblems = (): readonly string[] =>
  trackedManifests().flatMap((file) =>
    scriptFlagProblems(file, scriptsOf(file))
  );

const severitySpellings: readonly {
  readonly spelling: AllowWarnDeny;
  readonly severity: Severity;
}[] = [
  { spelling: 0, severity: "off" },
  { spelling: 1, severity: "warn" },
  { spelling: 2, severity: "error" },
  { spelling: "off", severity: "off" },
  { spelling: "allow", severity: "off" },
  { spelling: "warn", severity: "warn" },
  { spelling: "error", severity: "error" },
  { spelling: "deny", severity: "error" },
];

const ruleForms: readonly ((spelling: AllowWarnDeny) => DummyRule)[] = [
  (spelling) => spelling,
  (spelling) => [spelling],
  (spelling) => [spelling, { ignore: ["then"] }],
  (spelling) => [spelling, { ignore: ["then"] }, { allow: true }],
];

const generatedRules = [
  "generated/no-debugger",
  "generated/no-empty-function",
  "generated/prefer-await-to-then",
] as const;

const unsafeOxlintSpellings: readonly string[] = [
  "-A all",
  "-W all",
  "-D all",
  "-AW all",
  "-WA all",
  "-Dq all",
  "-q",
  "--quiet",
  "--quiet=true",
  "--allow all",
  "--warn all",
  "--deny all",
  "--allow=all",
  "--warn=all",
  "--deny=off",
  "--allow=off",
  "--max-warnings=5",
  "--max-warnings 5",
  "--max-warnings=1",
  "--disable-nested-config",
  "--disable-oxlint-rules",
  "--disable-all-rules",
  "--disable-oxlint-rules=true",
  "--report-unused-disable-directives-severity=off",
];

const allowlistedOxlintSpellings: readonly string[] = [
  "",
  "--fix",
  "--type-aware",
  "--format json",
  "--format=json",
  "--fix --type-aware",
];

const directiveMarker = ["//", "oxlint-disable-next-line", "no-debugger"].join(
  " "
);

const bareDirective = `${directiveMarker}\nvoid 0;\n`;

const reasonedDirective = `${directiveMarker} -- the fixture holds no debugger\nvoid 0;\n`;

const seededRandom = (seed: number): (() => number) => {
  const modulus = 2_147_483_647;
  let state = (seed % (modulus - 1)) + 1;

  return () => {
    state = (state * 48_271) % modulus;

    return (state - 1) / (modulus - 1);
  };
};

const pick = <Item>(random: () => number, items: readonly Item[]): Item => {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));

  const item = items[index];

  if (item === undefined) {
    throw new Error("Fix: the generator picked from an empty list.");
  }

  return item;
};

const configWith = (
  placement: "global" | "files",
  rule: string,
  setting: DummyRule,
  files: readonly string[] = ["**/*.ts"]
): OxlintConfig =>
  placement === "global"
    ? { rules: { [rule]: setting } }
    : {
        overrides: [{ files: [...files], rules: { [rule]: setting } }],
      };

const oxlintCommand = (spelling: string, extension: string): string =>
  ["oxlint", spelling, `src/example${extension}`]
    .filter((word) => word !== "")
    .join(" ");

describe("lint fence", () => {
  const declaredOff = new Set(offScopes(lintConfig).keys());

  const lintOptions: {
    readonly typeAware?: boolean;
    readonly maxWarnings?: number;
  } = lintConfig.options ?? {};

  it("turns off only rules the allowlist explains, at the pinned scope", () => {
    const unexplained = offRuleProblems(lintConfig, offRuleAllowlist);

    const stale = Object.keys(offRuleAllowlist).flatMap((name) =>
      declaredOff.has(name) ? [] : [name]
    );

    expect(
      unexplained,
      "A rule is off somewhere offRuleAllowlist does not cover, or at a wider scope than its reason explains. Fix: turn it back on in oxlint.config.ts, or add the rule to offRuleAllowlist in scripts/lint-fence.test.ts with a reason and the exact scope it may be off for."
    ).toEqual([]);
    expect(
      stale,
      "offRuleAllowlist lists a rule that oxlint.config.ts no longer turns off. Fix: delete that allowlist entry, or turn the rule back off only if Rat Stack really needs it."
    ).toEqual([]);
  });

  it("gives every allowlisted rule a plain sentence", () => {
    const thin = Object.entries(offRuleAllowlist).flatMap(
      ([name, { reason }]) =>
        reason.trim().endsWith(".") && reason.trim().length >= 20 ? [] : [name]
    );

    expect(
      thin,
      "Every offRuleAllowlist reason must be one plain sentence of at least 20 characters ending in a period, because the reason is what a reader checks when the rule hides a mistake."
    ).toEqual([]);
  });

  it("keeps every rule at error and the fence rules enabled", () => {
    expect(
      weakRuleProblems(lintConfig),
      "A rule is set to warn, which lets its findings pass. Fix: set it to error in oxlint.config.ts, or record an explicit off rule with a reason and scope in offRuleAllowlist in scripts/lint-fence.test.ts."
    ).toEqual([]);

    for (const name of fenceRuleNames) {
      expect(
        normalizeSeverity(lintConfig.rules?.[name]),
        `${name} must stay at error (options allowed) so the fence still reports. Fix: restore it in the rules map in oxlint.config.ts.`
      ).toBe("error");
    }
  });

  it("requires a reason on every disable directive", () => {
    const violations = trackedSourceFiles().flatMap((file) =>
      unreasonedDirectives(file)
    );

    expect(
      trackedSourceFiles().some((file) => file.endsWith(".cjs")),
      "The directive scan must cover .cjs sources. Fix: keep .cjs in sourceExtensions in scripts/lint-fence.test.ts, so a CommonJS source cannot carry an unexplained suppression."
    ).toBe(true);
    expect(
      violations,
      "A disable directive has no reason. Fix: write `// oxlint-disable-next-line <rule> -- <reason>`, `// @ts-expect-error -- <reason>`, or delete the directive. A bare disable hides the invariant that makes it safe, and this test fails instead."
    ).toEqual([]);
  });

  it("keeps lint running at full strength in every package.json", () => {
    const rootScripts = scriptsOf("package.json");
    const lintScript = rootScripts.lint ?? "";

    expect(
      lintScript,
      "package.json has no lint script. Fix: restore `lint` so the repo still runs Oxlint through Ultracite and checks formatting."
    ).toContain("ultracite check");
    expect(
      lintScript,
      "The lint script no longer runs `oxfmt --check`. Fix: restore the format check in the lint script in package.json."
    ).toContain("oxfmt --check");
    expect(
      trackedManifests(),
      "The script scan did not see the workspace manifests. Fix: make trackedManifests in scripts/lint-fence.test.ts list every tracked package.json, so a workspace script cannot weaken lint unseen."
    ).toContain("packages/core/package.json");
    expect(
      allScriptFlagProblems(),
      "A package.json script passes an oxlint flag that oxlintFlagAllowlist does not name, so the script can hide findings. Fix: remove the flag so every finding still fails the run, or add it to oxlintFlagAllowlist in scripts/lint-fence.test.ts with a reason."
    ).toEqual([]);
    expect(
      lintOptions.typeAware,
      "Oxlint must keep type-aware linting on. Fix: restore `options: { typeAware: true }` in oxlint.config.ts."
    ).toBe(true);
    expect(
      lintOptions.maxWarnings ?? 0,
      "Oxlint must not allow warnings past zero. Fix: remove maxWarnings from oxlint.config.ts, or set it to 0."
    ).toBe(0);
  });

  it("fails a rule turned off wider than its pin", () => {
    const globalOff = offRuleProblems(
      { rules: { "promise/prefer-await-to-then": "off" } },
      offRuleAllowlist
    );

    expect(
      globalOff.length,
      "Turning promise/prefer-await-to-then off globally must fail, because its reason covers test files only."
    ).toBe(1);
    expect(globalOff[0]).toContain("promise/prefer-await-to-then");
    expect(globalOff[0]).toContain("every file (global)");
  });

  it("fails a workspace script that weakens lint", () => {
    for (const command of [
      "oxlint --quiet",
      "oxlint -A all",
      "oxlint shared -W all",
      "pnpm --filter @pecunia/core exec oxlint -D all",
    ]) {
      const problems = scriptFlagProblems("packages/core/package.json", {
        lint: command,
      });

      expect(
        problems.length,
        `\`${command}\` in a workspace package.json must fail, because every workspace script runs in CI too.`
      ).toBeGreaterThan(0);
      expect(problems[0]).toContain('script "lint"');
      expect(problems[0]).toContain("oxlintFlagAllowlist");
    }

    expect(
      scriptFlagProblems("packages/core/package.json", {
        lint: "oxlint --fix shared",
      }),
      "An allowlisted flag must pass, so the fence judges the whole command instead of a list of known bad flags."
    ).toEqual([]);
  });

  it("judges every oxlint flag spelling and source extension by the one allowlist", () => {
    const manifest = "packages/core/package.json";
    const extensions = [...sourceExtensions];
    const allowlisted = Object.keys(oxlintFlagAllowlist);

    expect(
      [...sourceExtensionSet].toSorted(),
      "The source extension set must cover every kind of file Oxlint runs on. Fix: restore .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, and .cjs in sourceExtensions in scripts/lint-fence.test.ts."
    ).toEqual([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
    expect(
      allowlisted.toSorted(),
      "The script flag allowlist must hold exactly the flags this repo needs. Fix: add or remove the flag in oxlintFlagAllowlist in scripts/lint-fence.test.ts, with a reason."
    ).toEqual(["--fix", "--format", "--type-aware"]);

    let cases = 0;

    const checkUnsafe = (spelling: string, extension: string): void => {
      const command = oxlintCommand(spelling, extension);
      const file = `src/example${extension}`;
      const problems = scriptFlagProblems(manifest, { lint: command });

      expect(
        problems.length,
        `\`${command}\` must fail the script fence, because ${spelling} is not on the allowlist.`
      ).toBeGreaterThan(0);
      expect(problems[0], `\`${command}\` must name the script.`).toContain(
        'script "lint"'
      );
      expect(
        problems[0],
        `\`${command}\` must tell the reader to extend oxlintFlagAllowlist.`
      ).toContain("oxlintFlagAllowlist");
      expect(
        isScannedSource(file),
        `${file} must be scanned, so a suppression in it cannot hide.`
      ).toBe(true);
      expect(
        unreasonedDirectivesIn(file, bareDirective).length,
        `A bare oxlint-disable in ${file} must be reported.`
      ).toBe(1);

      cases += 1;
    };

    const checkAllowed = (spelling: string, extension: string): void => {
      const command = oxlintCommand(spelling, extension);
      const file = `src/example${extension}`;

      expect(
        scriptFlagProblems(manifest, { lint: command }),
        `\`${command}\` must pass the script fence, because every flag in it is allowlisted.`
      ).toEqual([]);
      expect(
        isScannedSource(file),
        `${file} must be scanned, so a suppression in it cannot hide.`
      ).toBe(true);
      expect(
        unreasonedDirectivesIn(file, reasonedDirective),
        `A reasoned directive in ${file} must pass.`
      ).toEqual([]);

      cases += 1;
    };

    for (const extension of extensions) {
      for (const spelling of unsafeOxlintSpellings) {
        checkUnsafe(spelling, extension);
      }

      for (const spelling of allowlistedOxlintSpellings) {
        checkAllowed(spelling, extension);
      }
    }

    const random = seededRandom(20_260_215);

    for (let index = 0; index < 600; index += 1) {
      const extension = pick(random, extensions);
      const combined = `-${pick(random, ["A", "W", "D"])}${pick(random, ["A", "W", "D", "q"])}`;

      if (random() < 0.25) {
        checkUnsafe(combined, extension);
      } else if (random() < 0.5) {
        checkUnsafe(pick(random, unsafeOxlintSpellings), extension);
      } else {
        checkAllowed(pick(random, allowlistedOxlintSpellings), extension);
      }
    }

    expect(
      cases,
      "The property test must keep at least 600 cases, so shrinking either set is visible."
    ).toBeGreaterThanOrEqual(600);
  });

  it("classifies every severity spelling by its normalised meaning", () => {
    const random = seededRandom(20_260_214);
    const cases = 512;

    for (let index = 0; index < cases; index += 1) {
      const { spelling, severity } = pick(random, severitySpellings);
      const setting = pick(random, ruleForms)(spelling);
      const rule = pick(random, generatedRules);
      const placement = random() < 0.5 ? "global" : "files";
      const config = configWith(placement, rule, setting);

      const scope: RuleScope =
        placement === "global"
          ? globalScope
          : { kind: "files", files: ["**/*.ts"] };

      const label = `case ${index}: ${rule} set to ${JSON.stringify(setting)} for ${describeScope(scope)}`;
      const offProblems = offRuleProblems(config, offRuleAllowlist);

      expect(
        normalizeSeverity(setting),
        `${label} must normalise to ${severity}.`
      ).toBe(severity);
      expect(
        weakRuleNames(config),
        `${label} must count as weak only when it warns.`
      ).toEqual(severity === "warn" ? [rule] : []);
      expect(
        offProblems.length,
        `${label} must fail when off and stay silent when error or warn.`
      ).toBe(severity === "off" ? 1 : 0);
      expect(
        ruleFenceProblems(config, offRuleAllowlist).length > 0,
        `${label} must fail when off or warn, since ${rule} is not in offRuleAllowlist.`
      ).toBe(severity !== "error");

      if (severity === "off") {
        expect(offProblems[0], `${label} must name the rule.`).toContain(rule);
        expect(
          offProblems[0],
          `${label} must name ${describeScope(scope)} as the scope it was found off for.`
        ).toContain(describeScope(scope));
      }
    }

    for (const { spelling, severity } of severitySpellings) {
      for (const form of ruleForms) {
        const setting = form(spelling);

        const pinnedConfig = configWith(
          "files",
          "promise/prefer-await-to-then",
          setting,
          testFileGlobs
        );

        const widerConfig = configWith(
          "global",
          "promise/prefer-await-to-then",
          setting
        );

        expect(
          ruleFenceProblems(pinnedConfig, offRuleAllowlist),
          `promise/prefer-await-to-then set to ${JSON.stringify(setting)} inside its pinned scope must fail only when it warns.`
        ).toEqual(
          severity === "warn"
            ? [expect.stringContaining("promise/prefer-await-to-then")]
            : []
        );
        expect(
          offRuleProblems(widerConfig, offRuleAllowlist).length,
          `promise/prefer-await-to-then set to ${JSON.stringify(setting)} globally must fail whenever it normalises to off.`
        ).toBe(severity === "off" ? 1 : 0);
      }
    }
  });
});
