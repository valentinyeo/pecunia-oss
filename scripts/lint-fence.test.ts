// @effect-diagnostics nodeBuiltinImport:off -- This test reads the repository's lint config, package manifests and tracked source files, writes scratch mirrors of them under the OS temp dir, and runs the real Oxlint binary against a debugger canary.
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

const scriptsOf = (file: string): Readonly<Record<string, string>> =>
  Schema.decodeSync(PackageManifest)(
    readFileSync(path.join(repoRoot, file), "utf-8")
  ).scripts ?? {};

const trackedFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
    .split("\0")
    .filter((file) => file !== "");

interface ResolvedRun {
  readonly owner: string;
  readonly command: string;
}

type ManifestScripts = ReadonlyMap<string, Readonly<Record<string, string>>>;

const directoryNames = (relative: string): readonly string[] => {
  const absolute = path.join(repoRoot, relative === "" ? "." : relative);

  if (!existsSync(absolute)) {
    return [];
  }

  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? [entry.name] : []))
    .toSorted();
};

const workspacePatterns = (): readonly string[] => {
  const lines = readFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    "utf-8"
  ).split("\n");

  const start = lines.findIndex((line) => line.trimEnd() === "packages:");

  if (start === -1) {
    throw new Error(
      "Fix: pnpm-workspace.yaml must keep its `packages:` list, so the fence can find every workspace package instead of trusting an allowlist."
    );
  }

  const patterns = lines
    .slice(start + 1)
    .flatMap((line) =>
      line.startsWith("  - ")
        ? [line.trim().replace(/^-\s+/u, "").replaceAll(/["']/gu, "")]
        : []
    );

  if (patterns.length === 0) {
    throw new Error(
      "Fix: pnpm-workspace.yaml must list its workspace globs under `packages:`, so the fence reads the real workspace instead of an empty list."
    );
  }

  return patterns;
};

const expandSegment = (
  prefixes: readonly string[],
  segment: string
): readonly string[] =>
  prefixes.flatMap((prefix) => {
    if (!segment.includes("*")) {
      return [prefix === "" ? segment : `${prefix}/${segment}`];
    }

    const matcher = new RegExp(`^${segment.replaceAll("*", "[^/]*")}$`, "u");

    return directoryNames(prefix)
      .filter((name) => matcher.test(name))
      .map((name) => (prefix === "" ? name : `${prefix}/${name}`));
  });

const expandWorkspacePattern = (pattern: string): readonly string[] => {
  let prefixes: readonly string[] = [""];

  for (const segment of pattern.split("/")) {
    prefixes = expandSegment(prefixes, segment);
  }

  return prefixes;
};

const workspaceDirectories = (): readonly string[] =>
  [
    ...new Set(
      workspacePatterns()
        .flatMap(expandWorkspacePattern)
        .filter((directory) =>
          existsSync(path.join(repoRoot, directory, "package.json"))
        )
    ),
  ].toSorted();

const workspaceManifests = (): readonly string[] =>
  workspaceDirectories().map((directory) => `${directory}/package.json`);

const manifestScriptsOf = (files: readonly string[]): ManifestScripts =>
  new Map(files.map((file) => [file, scriptsOf(file)]));

const scriptsAt = (
  scripts: ManifestScripts,
  file: string
): Readonly<Record<string, string>> => scripts.get(file) ?? {};

const runnerFlagsWithValues: ReadonlySet<string> = new Set([
  "--config",
  "--dir",
  "-C",
  "--filter",
  "-F",
  "--reporter",
  "--workspace",
]);

const wordsOf = (command: string): readonly string[] =>
  command
    .replaceAll(/["']/gu, " ")
    .split(/\s+/u)
    .filter((word) => word !== "");

const segmentsOf = (command: string): readonly string[] =>
  command
    .split(/&&|;/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

const argumentsAfterRunner = (words: readonly string[]): readonly string[] => {
  const rest: string[] = [];
  let index = 1;

  while (index < words.length) {
    const word = words[index] ?? "";

    if (word.startsWith("-")) {
      index += runnerFlagsWithValues.has(word) ? 2 : 1;
      continue;
    }

    rest.push(word);
    index += 1;
  }

  return rest;
};

const taskNamesIn = (args: readonly string[]): readonly string[] =>
  args.flatMap((word) => (word.startsWith("-") ? [] : [word]));

const expandScript = (
  file: string,
  name: string,
  scripts: ManifestScripts,
  visited: ReadonlySet<string>
): readonly ResolvedRun[] => {
  const key = `${file}\u0000${name}`;

  if (visited.has(key)) {
    return [];
  }

  const body = scriptsAt(scripts, file)[name];

  if (body === undefined) {
    return [{ owner: file, command: `-- missing ${name} script --` }];
  }

  return resolveCommand(file, body, scripts, new Set([...visited, key]));
};

const resolveTurbo = (
  owner: string,
  args: readonly string[],
  scripts: ManifestScripts,
  visited: ReadonlySet<string>
): readonly ResolvedRun[] => {
  const tasks = taskNamesIn(args);

  const expanded = tasks.flatMap((task) => [
    ...(scriptsAt(scripts, owner)[task] === undefined
      ? []
      : expandScript(owner, task, scripts, visited)),
    ...workspaceManifests().flatMap((file) =>
      scriptsAt(scripts, file)[task] === undefined
        ? []
        : expandScript(file, task, scripts, visited)
    ),
  ]);

  return expanded;
};

const resolveSegment = (
  owner: string,
  segment: string,
  scripts: ManifestScripts,
  visited: ReadonlySet<string>
): readonly ResolvedRun[] => {
  const words = wordsOf(segment);
  const program = words[0] ?? "";
  const args = argumentsAfterRunner(words);

  if (program === "pnpm" || program === "npm") {
    const name = args[0] === "run" ? args[1] : args[0];

    if (name !== undefined && scriptsAt(scripts, owner)[name] !== undefined) {
      return expandScript(owner, name, scripts, visited);
    }
  }

  if (program === "turbo" && args[0] === "run") {
    const expanded = resolveTurbo(owner, args.slice(1), scripts, visited);

    if (expanded.length > 0) {
      return expanded;
    }
  }

  return segment === "" ? [] : [{ owner, command: segment }];
};

const resolveCommand = (
  owner: string,
  command: string,
  scripts: ManifestScripts,
  visited: ReadonlySet<string>
): readonly ResolvedRun[] =>
  segmentsOf(command).flatMap((segment) =>
    resolveSegment(owner, segment, scripts, visited)
  );

const runsOxlint = (command: string): boolean =>
  wordsOf(command).some(
    (word) => word === "oxlint" || word.endsWith("/oxlint")
  ) || /\bultracite\s+check\b/u.test(command);

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

const weakeningSpellingsIn = (text: string): readonly string[] =>
  unsafeOxlintSpellings.filter((spelling) => text.includes(spelling));

const formatRuns = (runs: readonly ResolvedRun[]): string =>
  runs.map((run) => `\`${run.command}\``).join(", ");

const entryProblems = (
  file: string,
  script: string,
  scripts: ManifestScripts
): readonly string[] => {
  const body = scriptsAt(scripts, file)[script];

  if (body === undefined) {
    return [
      `${file} has no "${script}" script. Fix: keep a real "${script}" script, so the fence has an entry that has to run the linter.`,
    ];
  }

  const runs = resolveCommand(
    file,
    body,
    scripts,
    new Set([`${file}\u0000${script}`])
  );

  if (runs.length === 0) {
    return [
      `${file} script "${script}" runs \`${body}\`, which resolves to no command at all. Fix: make the "${script}" script run a real command that lints.`,
    ];
  }

  const linting = runs.filter((run) => runsOxlint(run.command));

  if (linting.length === 0) {
    return [
      `${file} script "${script}" runs \`${body}\`, which resolves to ${formatRuns(runs)}, and none of those runs Oxlint. Fix: run Oxlint from "${script}", directly, through \`ultracite check\`, or through another script that does, so the files it covers are really linted.`,
    ];
  }

  return linting.flatMap((run) =>
    weakeningSpellingsIn(run.command).map(
      (spelling) =>
        `${file} script "${script}" reaches \`${run.command}\`, which passes \`${spelling}\` and turns findings off. Fix: remove the flag from the command the "${script}" script finally runs.`
    )
  );
};

const lintEntries = (
  scripts: ManifestScripts
): readonly (readonly [string, string])[] => {
  const entries: (readonly [string, string])[] = [
    ["package.json", "lint"],
    ["package.json", "check"],
  ];

  for (const file of workspaceManifests()) {
    if (scriptsAt(scripts, file).lint !== undefined) {
      entries.push([file, "lint"]);
    }
  }

  return entries;
};

interface ConfigLine {
  readonly file: string;
  readonly line: number;
  readonly command: string;
}

const hookConfigFiles = ["lefthook.yml", "lefthook.yaml"];

const configFiles = (tracked: readonly string[]): readonly string[] =>
  [
    ...hookConfigFiles,
    ...tracked.filter(
      (file) => file.startsWith(".github/workflows/") && /\.ya?ml$/u.test(file)
    ),
  ].filter((file) => tracked.includes(file));

const yamlCommandLines = (file: string): readonly ConfigLine[] =>
  readFileSync(path.join(repoRoot, file), "utf-8")
    .split("\n")
    .flatMap((text, index) => {
      const trimmed = text.trim();
      const indented = text.startsWith(" ") || text.startsWith("\t");

      if (!indented || trimmed === "" || trimmed.startsWith("#")) {
        return [];
      }

      const command = trimmed
        .replace(/^-\s+/u, "")
        .replace(/^[A-Za-z0-9_.-]+:\s*/u, "")
        .replaceAll(/^["']|["']$/gu, "")
        .trim();

      return command === "" ? [] : [{ file, line: index + 1, command }];
    });

const configLineProblems = (scripts: ManifestScripts): readonly string[] =>
  configFiles(trackedFiles()).flatMap((file) =>
    yamlCommandLines(file).flatMap(({ line, command }) =>
      resolveCommand("package.json", command, scripts, new Set()).flatMap(
        (run) =>
          runsOxlint(run.command)
            ? weakeningSpellingsIn(run.command).map(
                (spelling) =>
                  `${file}:${line} runs \`${command}\`, which reaches \`${run.command}\` and passes \`${spelling}\`, turning findings off. Fix: remove the flag, so the hook and CI keep the whole Oxlint run.`
              )
            : []
      )
    )
  );

const oxlintBinary = path.join(repoRoot, "node_modules/.bin/oxlint");

const canarySource = "debugger;\n";

const mirroredEntries = [
  "oxlint.config.ts",
  "package.json",
  "tsconfig.base.json",
  "tsconfig.json",
];

const canaryPathOf = (directory: string): string =>
  directory === ""
    ? "fence-canary-root.ts"
    : `${directory}/src/fence-canary.ts`;

const writeFileWithParents = (
  root: string,
  relative: string,
  contents: string
): void => {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), contents);
};

const buildMirror = (root: string, directories: readonly string[]): void => {
  for (const entry of mirroredEntries) {
    copyFileSync(path.join(repoRoot, entry), path.join(root, entry));
  }

  for (const entry of ["node_modules", "scripts", "tools"]) {
    symlinkSync(path.join(repoRoot, entry), path.join(root, entry));
  }

  for (const directory of directories) {
    if (directory !== "") {
      mkdirSync(path.join(root, directory), { recursive: true });
      copyFileSync(
        path.join(repoRoot, directory, "package.json"),
        path.join(root, directory, "package.json")
      );

      const modules = path.join(repoRoot, directory, "node_modules");

      if (existsSync(modules)) {
        symlinkSync(modules, path.join(root, directory, "node_modules"));
      }
    }

    writeFileWithParents(root, canaryPathOf(directory), canarySource);
  }
};

const canaryBatchSize = 100;

const reportedBatch = (
  root: string,
  canaries: readonly string[],
  config: string | undefined
): ReadonlySet<string> => {
  const args = [...(config === undefined ? [] : ["-c", config]), ...canaries];

  const result = spawnSync(oxlintBinary, args, {
    cwd: root,
    encoding: "utf-8",
  });

  const output = `${result.stdout}${result.stderr}`;

  return new Set(canaries.filter((canary) => output.includes(`${canary}:1:1`)));
};

const unreportedCanaries = (
  root: string,
  canaries: readonly string[],
  config?: string
): readonly string[] => {
  const reported = new Set<string>();

  for (let start = 0; start < canaries.length; start += canaryBatchSize) {
    for (const canary of reportedBatch(
      root,
      canaries.slice(start, start + canaryBatchSize),
      config
    )) {
      reported.add(canary);
    }
  }

  return canaries.filter((canary) => !reported.has(canary));
};

const mutationConfigSource = (
  ignorePatterns: readonly string[],
  offRules: Readonly<Record<string, string>>
): string =>
  [
    'import config from "./oxlint.config.ts";',
    "",
    `const extraIgnorePatterns = ${JSON.stringify(ignorePatterns)};`,
    `const extraRules = ${JSON.stringify(offRules)};`,
    "",
    "export default {",
    "  ...config,",
    "  ignorePatterns: [...(config.ignorePatterns ?? []), ...extraIgnorePatterns],",
    "  rules: { ...config.rules, ...extraRules },",
    "};",
    "",
  ].join("\n");

const canaryConfig = (ignorePatterns: readonly string[]): string =>
  JSON.stringify({
    ignorePatterns: [...ignorePatterns],
    rules: { "no-debugger": "error" },
  });

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

  it("keeps the Oxlint config at full strength", () => {
    expect(
      readFileSync(path.join(repoRoot, "oxlint.config.ts"), "utf-8"),
      "Ultracite check only counts as the real linter while oxlint.config.ts extends the Ultracite Oxlint config. Fix: restore the `ultracite/oxlint/core` import in oxlint.config.ts, or stop counting `ultracite check` as an Oxlint run."
    ).toContain("ultracite/oxlint");
    expect(
      lintOptions.typeAware,
      "Oxlint must keep type-aware linting on. Fix: restore `options: { typeAware: true }` in oxlint.config.ts."
    ).toBe(true);
    expect(
      lintOptions.maxWarnings ?? 0,
      "Oxlint must not allow warnings past zero. Fix: remove maxWarnings from oxlint.config.ts, or set it to 0."
    ).toBe(0);
  });

  it("requires a reason on every disable directive", () => {
    const violations = trackedSourceFiles().flatMap((file) =>
      unreasonedDirectives(file)
    );

    for (const extension of sourceExtensions) {
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

    expect(
      violations,
      "A disable directive has no reason. Fix: write `// oxlint-disable-next-line <rule> -- <reason>`, `// @ts-expect-error -- <reason>`, or delete the directive. A bare disable hides the invariant that makes it safe, and this test fails instead."
    ).toEqual([]);
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

  it("resolves every lint entry to a real Oxlint run", () => {
    const scripts = manifestScriptsOf([
      "package.json",
      ...workspaceManifests(),
    ]);

    expect(
      workspaceDirectories(),
      "The fence read the workspace from pnpm-workspace.yaml and found no packages. Fix: keep the `packages:` globs in pnpm-workspace.yaml, so the fence checks the real workspace instead of an empty list."
    ).toContain("packages/core");
    expect(
      lintEntries(scripts).flatMap(([file, script]) =>
        entryProblems(file, script, scripts)
      ),
      "A lint entry resolves, through its own scripts, to a command that runs no Oxlint, or to an Oxlint run with a flag that turns findings off. Fix: run Oxlint from the lint script, directly, through `ultracite check`, or through a script that does, so the files it covers are really linted."
    ).toEqual([]);
    expect(
      configLineProblems(scripts),
      "A hook or CI line reaches an Oxlint run with a flag that turns findings off. Fix: remove the flag from the command that line finally runs, so the pre-commit hook and CI keep the whole lint run."
    ).toEqual([]);
  });

  it("reports a debugger canary in every workspace package and the root", () => {
    const directories = ["", ...workspaceDirectories()];
    const canaries = directories.map(canaryPathOf);
    const root = mkdtempSync(path.join(tmpdir(), "pecunia-lint-fence-"));

    try {
      buildMirror(root, directories);

      expect(
        directories.length,
        "The canary run needs the root and every workspace package. Fix: keep the workspace globs in pnpm-workspace.yaml readable."
      ).toBeGreaterThan(10);
      expect(
        unreportedCanaries(root, canaries),
        "A workspace package, or the root, holds a `debugger;` file the repo's own Oxlint config never reports, so its source can be broken while lint passes. Fix: stop excluding that path in oxlint.config.ts, in a nested config, or in a per-package `.oxlintrc.json`, and keep Oxlint at error for it."
      ).toEqual([]);

      writeFileSync(
        path.join(root, "fence-hides-every-package.ts"),
        mutationConfigSource(["apps/**", "packages/**"], {})
      );

      const workspaceCanaries = directories.flatMap((directory) =>
        directory === "" ? [] : [`${directory}/src/fence-canary.ts`]
      );

      const hidden = unreportedCanaries(
        root,
        canaries,
        "fence-hides-every-package.ts"
      );

      expect(
        [...hidden].toSorted(),
        "`ignorePatterns` entries of `apps/**` and `packages/**` hide every workspace package, so the fence must report each of them as unreported. Fix: keep the canary check running the real Oxlint with the repo config, so a hidden package fails by name."
      ).toEqual(workspaceCanaries.toSorted());
      expect(
        hidden,
        "The workspace-wide mutation must leave the root canary reported, so the check proves an ignore pattern hides packages rather than the whole Oxlint run failing."
      ).not.toContain("fence-canary-root.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails generated lint entries, weakened configs and hidden packages by name", () => {
    const rootManifest = "package.json";
    const packageManifest = "packages/core/package.json";
    const approvedBody = scriptsOf(rootManifest).lint ?? "";

    const generatedScripts = {
      "format:check": "oxfmt --check",
      "lint:full": "ultracite check && oxfmt --check .",
      "lint:indirect": "pnpm format:check",
    };

    const judgeBody = (body: string): readonly string[] =>
      entryProblems(
        packageManifest,
        "lint",
        new Map([
          [rootManifest, scriptsOf(rootManifest)],
          [packageManifest, { ...generatedScripts, lint: body }],
        ])
      );

    const scriptMutations: readonly string[] = [
      "echo lint passed",
      "oxfmt --check",
      "pnpm format:check",
      "pnpm run lint:indirect",
      "pnpm run lint:indirect && oxfmt --check .",
      "pnpm lint:indirect; oxfmt --check .",
      "oxfmt --check && echo done",
      "npm run format:check",
    ];

    const approvedBodies: readonly string[] = [
      approvedBody,
      "ultracite check && oxfmt --check .",
      "oxlint . && oxfmt --check .",
      "pnpm run lint:full",
      "pnpm lint:full",
      "npm run lint:full",
      "turbo run lint:full",
      "pnpm run lint:full; oxfmt --check .",
      "oxfmt . && pnpm run lint:full",
    ];

    const random = seededRandom(20_260_216);

    const names = workspaceDirectories().map((directory) =>
      path.basename(directory)
    );

    interface HiddenCase {
      readonly hidden: string;
      readonly neighbour: string;
      readonly pattern: string;
    }

    const hiddenCases: HiddenCase[] = [];

    let cases = 0;
    let rejected = 0;
    let accepted = 0;

    const checkEntry = (body: string): void => {
      const problems = judgeBody(body);
      const label = `\`${body}\` in ${packageManifest} script "lint"`;

      if (approvedBodies.includes(body)) {
        expect(
          problems,
          `${label} is the approved neighbour copy of a real lint body, so it must pass.`
        ).toEqual([]);
        accepted += 1;
      } else {
        expect(
          problems.length,
          `${label} must fail, because that script lints nothing by name.`
        ).toBeGreaterThan(0);
        expect(problems[0], `${label} must name the manifest.`).toContain(
          packageManifest
        );
        expect(problems[0], `${label} must name the script.`).toContain(
          'script "lint"'
        );
        rejected += 1;
      }

      cases += 1;
    };

    for (let index = 0; index < 620; index += 1) {
      const roll = random();

      if (roll < 0.4) {
        checkEntry(pick(random, [...scriptMutations, ...approvedBodies]));
        continue;
      }

      if (roll < 0.75) {
        const { spelling, severity } = pick(random, severitySpellings);
        const setting = pick(random, ruleForms)(spelling);
        const rule = pick(random, generatedRules);
        const placement = random() < 0.5 ? "global" : "files";

        const problems = ruleFenceProblems(
          configWith(placement, rule, setting),
          offRuleAllowlist
        );

        const label = `${rule} set to ${JSON.stringify(setting)} for ${placement} files`;

        expect(
          normalizeSeverity(setting),
          `${label} must normalise to ${severity}.`
        ).toBe(severity);
        expect(
          problems.length > 0,
          `${label} must fail unless the rule stays at error, since no allowlist entry explains it.`
        ).toBe(severity !== "error");

        if (problems.length > 0) {
          expect(
            problems.every((problem) => problem.includes(rule)),
            `Every problem for ${label} must name ${rule}.`
          ).toBe(true);
          rejected += 1;
        } else {
          accepted += 1;
        }

        cases += 1;
        continue;
      }

      const hidden = pick(random, names);

      hiddenCases.push({
        hidden,
        neighbour: pick(
          random,
          names.filter((name) => name !== hidden)
        ),
        pattern: pick(random, [
          `packages/${hidden}/**`,
          `packages/${hidden}/src/**`,
          `**/${hidden}/**`,
        ]),
      });

      cases += 1;
    }

    expect(
      hiddenCases.length,
      "The generated cases must include hidden packages, so the ignorePatterns hole is covered by behaviour."
    ).toBeGreaterThan(80);
    expect(
      cases,
      "The property test must keep at least 600 cases, so shrinking any set is visible."
    ).toBeGreaterThanOrEqual(600);
    expect(
      rejected,
      "The property test must reject the mutations, so a fence that accepts everything fails here."
    ).toBeGreaterThanOrEqual(150);
    expect(
      accepted,
      "The property test must accept the approved neighbour copies, so a fence that accepts nothing fails here."
    ).toBeGreaterThanOrEqual(1);

    const scratch = mkdtempSync(
      path.join(tmpdir(), "pecunia-lint-fence-cases-")
    );

    try {
      const distinct = new Map<string, HiddenCase>();

      for (const item of hiddenCases) {
        if (!distinct.has(item.pattern)) {
          distinct.set(item.pattern, item);
        }
      }

      const verdicts = new Map<
        string,
        { readonly hidden: boolean; readonly neighbour: boolean }
      >();

      for (const [index, { hidden, neighbour, pattern }] of [
        ...distinct.values(),
      ].entries()) {
        const hiddenCanary = `${index}/packages/${hidden}/src/fence-canary.ts`;
        const neighbourCanary = `${index}/packages/${neighbour}/src/fence-canary.ts`;

        writeFileWithParents(scratch, hiddenCanary, canarySource);
        writeFileWithParents(scratch, neighbourCanary, canarySource);
        writeFileSync(
          path.join(scratch, index.toString(), ".oxlintrc.json"),
          canaryConfig([pattern])
        );

        const unreported = new Set(
          unreportedCanaries(scratch, [hiddenCanary, neighbourCanary])
        );

        verdicts.set(pattern, {
          hidden: unreported.has(hiddenCanary),
          neighbour: unreported.has(neighbourCanary),
        });
      }

      for (const { hidden, neighbour, pattern } of hiddenCases) {
        const verdict = verdicts.get(pattern);
        const label = `\`${pattern}\` hiding ${hidden} next to ${neighbour}`;

        expect(
          verdict?.hidden,
          `${label} must hide that package's canary from the real Oxlint, so the generated hidden package case really covers the ignorePatterns hole.`
        ).toBe(true);
        expect(
          verdict?.neighbour,
          `${label} must leave the neighbour reported, so the check separates a hidden package from a broken Oxlint run.`
        ).toBe(false);
      }
    } finally {
      rmSync(scratch, { force: true, recursive: true });
    }
  });

  it("keeps every generated config rule off or warn spelled out at its scope", () => {
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
