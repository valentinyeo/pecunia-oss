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
  trackedFiles().filter(isScannedSource);

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

type ScriptAllowlist = Readonly<Record<string, string>>;

const scriptAllowlist = {
  oxfmt:
    "The bare formatter touches only the paths pnpm hands it, with no ignore flag of its own.",
  "oxfmt --check":
    "The format check reports every unformatted file and exits non-zero without writing.",
  "ultracite check && oxfmt --check .":
    "The lint script runs the whole Ultracite rule set over the tree, then proves formatting.",
  "ultracite fix && oxfmt .":
    "The fix script rewrites only what Ultracite and Oxfmt can repair, with every rule still on.",
  "pnpm run lockfile:check && varlock load && turbo run typecheck typecheck-scripts && ultracite check && oxfmt --check .":
    "The check script loads env values, typechecks, then lints and format-checks the tree before it reports success.",
  "node apps/site/scripts/generate-content.ts --git-snapshot && oxfmt .brain/data/git-snapshot.json":
    "The site build refreshes the git snapshot and formats that one generated file.",
  "oxlint shared scripts exercises vitest.config.ts vitest.exercise.config.ts && oxfmt --check shared scripts exercises vitest.config.ts vitest.exercise.config.ts package.json tsconfig.json .oxlintrc.json .oxfmtrc.json .pi/settings.json README.md AGENTS.md CONTRIBUTING.md PROVENANCE.md":
    "The starter example lints its own configs and docs, then format-checks the same paths.",
  "oxfmt shared scripts exercises vitest.config.ts vitest.exercise.config.ts package.json tsconfig.json .oxlintrc.json .oxfmtrc.json .pi/settings.json README.md AGENTS.md CONTRIBUTING.md PROVENANCE.md":
    "The starter example formats its own configs and docs with no path excluded.",
  "pnpm typecheck && pnpm lint && pnpm test":
    "The starter example runs typecheck, its own lint, then its tests, so the sample keeps the full gate.",
  "node scripts/generate-content.ts":
    "The site generate script runs the content build, which reads the debt-ledger config and cannot turn a repo rule off.",
  "apps/site/scripts/generate-content.ts":
    "The site content build runs Oxlint itself with the debt-ledger config, so it names the tool without weakening the repo fence.",
} satisfies ScriptAllowlist;

const lintWordPattern = /oxlint|ultracite|oxfmt|lint/iu;

const lintToolPattern = /oxlint|ultracite|oxfmt/iu;

const helperExtensions = [".sh", ".mjs", ".cjs", ".js", ".ts"] as const;

const commandWords = (command: string): readonly string[] =>
  command
    .replaceAll(/["']/gu, " ")
    .split(/\s+/u)
    .filter((word) => word !== "");

interface ScriptSubject {
  readonly file: string;
  readonly name: string;
  readonly body: string;
}

interface ConfigCommand {
  readonly file: string;
  readonly command: string;
}

type HelperLookup = (helper: string) => string | undefined;

const mentionsLintTool = (text: string): boolean => lintToolPattern.test(text);

const helperPathsIn = (subject: ScriptSubject): readonly string[] => [
  ...new Set(
    commandWords(subject.body)
      .filter((word) =>
        helperExtensions.some((extension) => word.endsWith(extension))
      )
      .map((word) =>
        path.posix.normalize(
          path.posix.join(path.posix.dirname(subject.file), word)
        )
      )
      .filter((helper) => !helper.startsWith(".."))
  ),
];

const lintHelpersIn = (
  subject: ScriptSubject,
  lookupHelper: HelperLookup
): readonly string[] =>
  helperPathsIn(subject).filter((helper) => {
    const source = lookupHelper(helper);

    return source !== undefined && mentionsLintTool(source);
  });

const bodyProblem = (subject: ScriptSubject): string =>
  `${subject.file} script "${subject.name}" runs \`${subject.body}\`, which names lint, and scriptAllowlist holds no entry for that exact body. Fix: add it to scriptAllowlist in scripts/lint-fence.test.ts with a one-sentence reason for why it cannot hide a finding, or remove the lint words from the script.`;

const helperProblem = (subject: ScriptSubject, helper: string): string =>
  `${subject.file} script "${subject.name}" runs ${helper}, which names oxlint, ultracite or oxfmt, and scriptAllowlist holds no entry for that helper. Fix: add "${helper}" to scriptAllowlist in scripts/lint-fence.test.ts with a one-sentence reason, or stop running it from a package.json script.`;

const subjectProblems = (
  subject: ScriptSubject,
  lookupHelper: HelperLookup,
  allowlist: ScriptAllowlist
): readonly string[] => {
  const lintHelpers = lintHelpersIn(subject, lookupHelper);

  const judged = lintWordPattern.test(subject.body) || lintHelpers.length > 0;

  return [
    ...(judged && !Object.hasOwn(allowlist, subject.body)
      ? [bodyProblem(subject)]
      : []),
    ...lintHelpers.flatMap((helper) =>
      Object.hasOwn(allowlist, helper) ? [] : [helperProblem(subject, helper)]
    ),
  ];
};

const yamlScalars = (source: string): readonly string[] =>
  source.split("\n").flatMap((line) => {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      return [];
    }

    const scalar = trimmed
      .replace(/^-\s+/u, "")
      .replace(/^[A-Za-z0-9_.-]+:\s*/u, "")
      .replaceAll(/^["']|["']$/gu, "")
      .trim();

    return scalar === "" ? [] : [scalar];
  });

const configCommandsIn = (
  file: string,
  source: string
): readonly ConfigCommand[] =>
  yamlScalars(source)
    .filter((scalar) => mentionsLintTool(scalar))
    .map((command) => ({ file, command }));

const configCommandProblem = ({ file, command }: ConfigCommand): string =>
  `${file} runs \`${command}\`, which names oxlint, ultracite or oxfmt, and scriptAllowlist holds no entry for that exact line. Fix: add it to scriptAllowlist in scripts/lint-fence.test.ts with a one-sentence reason, or drop the line from the hook or workflow config.`;

const configCommandProblems = (
  commands: readonly ConfigCommand[],
  allowlist: ScriptAllowlist
): readonly string[] =>
  commands.flatMap((command) =>
    Object.hasOwn(allowlist, command.command)
      ? []
      : [configCommandProblem(command)]
  );

const trackedFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
    .split("\0")
    .filter((file) => file !== "");

const helperLookupFor = (tracked: ReadonlySet<string>): HelperLookup =>
  function lookupHelper(helper) {
    return tracked.has(helper)
      ? readFileSync(path.join(repoRoot, helper), "utf-8")
      : undefined;
  };

const trackedScriptSubjects = (): readonly ScriptSubject[] =>
  trackedManifests().flatMap((file) =>
    Object.entries(scriptsOf(file)).map(([name, body]) => ({
      file,
      name,
      body,
    }))
  );

const hookConfigFiles = ["lefthook.yml", "lefthook.yaml"];

const configFiles = (tracked: readonly string[]): readonly string[] =>
  [
    ...hookConfigFiles,
    ...tracked.filter(
      (file) => file.startsWith(".github/workflows/") && /\.ya?ml$/u.test(file)
    ),
  ].filter((file) => tracked.includes(file));

const trackedConfigCommands = (): readonly ConfigCommand[] => {
  const tracked = trackedFiles();

  return configFiles(tracked).flatMap((file) =>
    configCommandsIn(file, readFileSync(path.join(repoRoot, file), "utf-8"))
  );
};

const trackedScriptProblems = (): readonly string[] => {
  const tracked = new Set(trackedFiles());
  const lookupHelper = helperLookupFor(tracked);

  return trackedScriptSubjects().flatMap((subject) =>
    subjectProblems(subject, lookupHelper, scriptAllowlist)
  );
};

const staleAllowlistEntries = (): readonly string[] => {
  const tracked = new Set(trackedFiles());
  const lookupHelper = helperLookupFor(tracked);

  const used = new Set(trackedConfigCommands().map(({ command }) => command));

  for (const subject of trackedScriptSubjects()) {
    const lintHelpers = lintHelpersIn(subject, lookupHelper);

    if (lintWordPattern.test(subject.body) || lintHelpers.length > 0) {
      used.add(subject.body);
    }

    for (const helper of lintHelpers) {
      used.add(helper);
    }
  }

  return Object.keys(scriptAllowlist).filter((entry) => !used.has(entry));
};

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

const unsafeScriptBodies: readonly string[] = [
  "ultracite check -A all",
  "ultracite check --allow all && oxfmt --check .",
  "ultracite fix --deny off",
  'OXLINT_FLAGS="-A all" oxlint $OXLINT_FLAGS',
  "oxlint shared && oxfmt --check .",
  "pnpm exec oxlint -A all",
  "pnpm exec bash scripts/verify-lint.sh",
  "pnpm --filter @pecunia/core exec oxlint --deny all",
  "bash scripts/verify-lint.sh",
  "node scripts/verify-lint.mjs",
  "tsx scripts/verify-lint.ts",
  "'oxlint' '-A all'",
  "  oxlint   -A all  ",
];

const fixtureHelper = (helper: string): string | undefined =>
  helper === "scripts/verify-lint.sh" ? 'oxlint -A all "$@"\n' : undefined;

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

  it("gives every allowlisted script a plain sentence", () => {
    const thin = Object.entries(scriptAllowlist).flatMap(([entry, reason]) =>
      reason.trim().endsWith(".") && reason.trim().length >= 20 ? [] : [entry]
    );

    expect(
      thin,
      "Every scriptAllowlist reason must be one plain sentence of at least 20 characters ending in a period, because that reason is what a reader checks when a script touches lint."
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
      trackedScriptProblems(),
      "A package.json script names lint, or runs a helper that does, and scriptAllowlist holds no entry for that exact body or helper. Fix: add it to scriptAllowlist in scripts/lint-fence.test.ts with a one-sentence reason, or remove it."
    ).toEqual([]);
    expect(
      configCommandProblems(trackedConfigCommands(), scriptAllowlist),
      "A hook or workflow config line names oxlint, ultracite or oxfmt without an allowlist entry, so CI could run lint outside the fence. Fix: add that exact line to scriptAllowlist with a reason, or drop it."
    ).toEqual([]);
    expect(
      staleAllowlistEntries(),
      "scriptAllowlist names a body, helper or config line that nothing uses any more. Fix: delete that entry, or restore the script it pins."
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
    for (const body of [
      "oxlint --quiet",
      "oxlint -A all",
      "oxlint shared -W all",
      "pnpm --filter @pecunia/core exec oxlint -D all",
      "ultracite check -A all && oxfmt --check .",
      "pnpm exec ultracite check --allow all",
      'OXLINT_FLAGS="-A all" oxlint $OXLINT_FLAGS',
    ]) {
      const problems = subjectProblems(
        { file: "packages/core/package.json", name: "lint", body },
        fixtureHelper,
        scriptAllowlist
      );

      expect(
        problems.length,
        `\`${body}\` in a workspace package.json must fail, because every workspace script runs in CI too.`
      ).toBeGreaterThan(0);
      expect(problems[0]).toContain("packages/core/package.json");
      expect(problems[0]).toContain('script "lint"');
      expect(problems[0]).toContain("scriptAllowlist");
    }

    expect(
      subjectProblems(
        {
          file: "packages/core/package.json",
          name: "lint",
          body: "ultracite check && oxfmt --check .",
        },
        fixtureHelper,
        scriptAllowlist
      ),
      "An allowlisted body must pass, so the fence judges the whole script instead of the words inside it."
    ).toEqual([]);
  });

  it("follows a script into the helper it runs", () => {
    const subject: ScriptSubject = {
      file: "package.json",
      name: "lint",
      body: "bash scripts/verify-lint.sh",
    };

    expect(
      lintHelpersIn(subject, fixtureHelper),
      "The fence must resolve a script's helper path from the manifest directory and read it, so indirection cannot hide a weakened command."
    ).toEqual(["scripts/verify-lint.sh"]);

    const bodyOnly = {
      "bash scripts/verify-lint.sh":
        "The wrapper is approved as one exact body so the helper rule has a script to judge.",
    } satisfies ScriptAllowlist;

    expect(
      subjectProblems(subject, fixtureHelper, bodyOnly),
      "An allowlisted script body must still fail when the helper it runs names oxlint and is not allowlisted, because the helper is where the flags live."
    ).toEqual([expect.stringContaining("scripts/verify-lint.sh")]);

    expect(
      helperPathsIn({
        file: "package.json",
        name: "deploy:preview",
        body: "bash scripts/deploy-preview.sh",
      }),
      "Helper resolution must work on the real tree, so the scan reads the scripts it claims to read."
    ).toContain("scripts/deploy-preview.sh");
  });

  it("judges every lint word in the hook and CI config", () => {
    const hookSource = [
      "# oxlint -A all in a comment is prose, not a command",
      "pre-commit:",
      "  parallel: false",
      "  commands:",
      "    check:",
      "      run: pnpm exec ultracite check -A all",
      "    test:",
      "      run: pnpm test",
      "    format:",
      '      run: "oxfmt --check"',
    ].join("\n");

    expect(
      configCommandsIn("lefthook.yml", hookSource),
      "The config scan must judge every command line that names a lint tool and only those, so a commented line or an unrelated hook is not mistaken for one."
    ).toEqual([
      { file: "lefthook.yml", command: "pnpm exec ultracite check -A all" },
      { file: "lefthook.yml", command: "oxfmt --check" },
    ]);
    expect(
      configCommandProblems(
        configCommandsIn("lefthook.yml", hookSource),
        scriptAllowlist
      ).length,
      "A hook or workflow line that names oxlint, ultracite or oxfmt and is not allowlisted must fail, because a config file hides a bypass the same way a script does."
    ).toBe(1);
    expect(
      configFiles(trackedFiles()),
      "The config scan must reach the tracked workflows, so a new CI lint step cannot slip past the fence."
    ).toContain(".github/workflows/ci.yml");
    expect(
      configCommandProblems(
        configCommandsIn(
          "lefthook.yml",
          "      run: ultracite check && oxfmt --check ."
        ),
        scriptAllowlist
      ),
      "An allowlisted command line must pass, so the config rule judges whole commands instead of scanning for bad words."
    ).toEqual([]);
  });

  it("judges every script body as one exact string", () => {
    const manifest = "packages/core/package.json";
    const extensions = [...sourceExtensions];

    expect(
      [...sourceExtensionSet].toSorted(),
      "The source extension set must cover every kind of file Oxlint runs on. Fix: restore .ts, .tsx, .js, .jsx, .mts, .cts, .mjs, and .cjs in sourceExtensions in scripts/lint-fence.test.ts."
    ).toEqual([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);

    let cases = 0;
    let rejected = 0;
    let accepted = 0;

    const checkBody = (body: string): void => {
      const problems = subjectProblems(
        { file: manifest, name: "lint", body },
        fixtureHelper,
        scriptAllowlist
      );

      if (Object.hasOwn(scriptAllowlist, body)) {
        expect(
          problems,
          `\`${body}\` is allowlisted, so the fence must accept it.`
        ).toEqual([]);
        accepted += 1;
      } else {
        expect(
          problems.length,
          `\`${body}\` is not in scriptAllowlist, so the fence must reject it however it is written.`
        ).toBeGreaterThan(0);
        expect(problems[0], `\`${body}\` must name the file.`).toContain(
          manifest
        );
        expect(problems[0], `\`${body}\` must name the script.`).toContain(
          'script "lint"'
        );
        expect(
          problems[0],
          `\`${body}\` must tell the reader to extend scriptAllowlist.`
        ).toContain("scriptAllowlist");
        rejected += 1;
      }

      cases += 1;
    };

    for (const body of Object.keys(scriptAllowlist)) {
      checkBody(body);
    }

    for (const extension of extensions) {
      for (const spelling of unsafeOxlintSpellings) {
        checkBody(oxlintCommand(spelling, extension));
      }

      const file = `src/example${extension}`;

      expect(
        isScannedSource(file),
        `${file} must be scanned, so a suppression in it cannot hide.`
      ).toBe(true);
      expect(
        unreasonedDirectivesIn(file, bareDirective).length,
        `A bare oxlint-disable in ${file} must be reported.`
      ).toBe(1);
      expect(
        unreasonedDirectivesIn(file, reasonedDirective),
        `A reasoned directive in ${file} must pass.`
      ).toEqual([]);
    }

    const random = seededRandom(20_260_216);
    const glues = [" ", "  ", " && ", " && pnpm exec ", '  "', "' "];
    const listedBodies = Object.keys(scriptAllowlist);

    for (const body of listedBodies) {
      checkBody(`${body} && oxlint -A all`);
      checkBody(`${body} && ultracite check --allow all`);
    }

    for (let index = 0; index < 600; index += 1) {
      const glue = pick(random, glues);
      const roll = random();

      if (roll < 0.3) {
        checkBody(pick(random, listedBodies));
      } else if (roll < 0.55) {
        checkBody(pick(random, unsafeScriptBodies));
      } else if (roll < 0.8) {
        checkBody(
          `${pick(random, unsafeScriptBodies)}${glue}${pick(random, unsafeScriptBodies)}`
        );
      } else {
        checkBody(
          `${pick(random, listedBodies)}${glue}${pick(random, unsafeScriptBodies)}`
        );
      }
    }

    expect(
      cases,
      "The property test must keep at least 600 cases, so shrinking either set is visible."
    ).toBeGreaterThanOrEqual(600);
    expect(
      rejected,
      "The property test must reject the unsafe bodies it generates, so a fence that accepts everything fails here."
    ).toBeGreaterThanOrEqual(600);
    expect(
      accepted,
      "The property test must accept every allowlist entry, so a fence that accepts nothing fails here."
    ).toBeGreaterThanOrEqual(Object.keys(scriptAllowlist).length);
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
