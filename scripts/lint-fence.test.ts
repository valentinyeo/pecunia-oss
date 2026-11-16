// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off -- This test reads the repository's tracked paths and manifests, writes a scratch mirror under the OS temp dir, and runs the real Oxlint binary against canary files it plants there, in parallel, because one sequential run per workspace package takes longer than the suite may spend.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
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
import core from "ultracite/oxlint/core";
import { describe, expect, it } from "vitest";

import lintConfig from "../oxlint.config.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

const oxlintBinary = path.join(repoRoot, "node_modules/.bin/oxlint");

const LINT_COMMAND = "oxlint .";

const configFileNamePattern =
  /^(?:\.oxlintrc(?:\.[\w.-]+)?|oxlint\.config\.[cm]?[jt]s)$/u;

const allowedConfigFiles = new Map([
  ["oxlint.config.ts", "the one root Oxlint config"],
]);

const allowedOtherConfigFiles = new Map([
  [
    "examples/tokenmaxx-starter/.oxlintrc.json",
    "the standalone starter example sits outside the pnpm workspace, never imports @pecunia/*, and is copied into a new project rather than linted here.",
  ],
]);

const repoIgnorePatterns = [
  ".agent_sources/**",
  ".agent-sources/**",
  "**/dist/**",
  "node_modules/**",
  ".pi/**",
  ".cursor/**",
  ".claude/**",
  "scripts/hooks/**",
  "tools/oxlint/anti-slop/**",
  "skills/security-audit/**",
] as const;

const allowedExtends: NonNullable<OxlintConfig["extends"]> = [core];

const rootScripts = new Map([
  ["lint", "ultracite check && oxfmt --check ."],
  [
    "check",
    "pnpm run lockfile:check && varlock load && turbo run typecheck typecheck-scripts && ultracite check && oxfmt --check .",
  ],
  ["test", "pnpm test:security-audit && pnpm test:guards && turbo run test"],
  ["test:guards", "vitest run scripts/*.test.ts"],
]);

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

const isSourceExtension = (file: string): boolean =>
  sourceExtensionSet.has(path.extname(file));

const extensionAlternatives = sourceExtensions
  .map((extension) => extension.slice(1))
  .join(",");

const testFileGlobs: readonly string[] = [
  `**/*.{test,spec,test-d,spec-d}.{${extensionAlternatives}}`,
  `**/__tests__/**/*.{${extensionAlternatives}}`,
];

const testFilesScope: RuleScope = { kind: "files", files: testFileGlobs };

const foldkitTestOnly: AllowlistEntry = {
  reason:
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
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

const extendsProblems = (
  entries: NonNullable<OxlintConfig["extends"]>
): readonly string[] =>
  entries.flatMap((entry, index) =>
    allowedExtends.some((allowed) => allowed === entry)
      ? []
      : [
          `oxlint.config.ts extends a config at index ${index} that the fixed table in scripts/lint-fence.test.ts does not allow. Fix: keep extends to the imported ultracite/oxlint/core object alone, so no second config can turn rules off behind the allowlist.`,
        ]
  );

const ignorePatternProblems = (
  patterns: readonly string[]
): readonly string[] => {
  const expected = [...(core.ignorePatterns ?? []), ...repoIgnorePatterns];
  const extra = patterns.filter((pattern) => !expected.includes(pattern));
  const missing = expected.filter((pattern) => !patterns.includes(pattern));

  if (extra.length === 0 && missing.length === 0) {
    return patterns.length === expected.length &&
      patterns.every((pattern, index) => pattern === expected[index])
      ? []
      : [
          `oxlint.config.ts ignorePatterns holds the right entries in a different order or with a duplicate. Fix: keep it as [...core.ignorePatterns, ...repoIgnorePatterns], exactly as the fence reads it.`,
        ];
  }

  return [
    ...extra.map(
      (pattern) =>
        `oxlint.config.ts ignores ${pattern}, which the fixed table in scripts/lint-fence.test.ts does not list, so Oxlint may skip files this fence never sees. Fix: remove the pattern, or list it in repoIgnorePatterns with a reason.`
    ),
    ...missing.map(
      (pattern) =>
        `oxlint.config.ts stopped ignoring ${pattern}, which the fixed table still lists. Fix: restore the pattern, or delete it from repoIgnorePatterns in scripts/lint-fence.test.ts.`
    ),
  ];
};

const isConfigFileName = (file: string): boolean =>
  configFileNamePattern.test(path.basename(file));

const unsearchedDirectories: ReadonlySet<string> = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);

const repoConfigFiles = (): readonly string[] => {
  const found: string[] = [];

  const walk = (relative: string): void => {
    for (const entry of readdirSync(path.join(repoRoot, relative), {
      withFileTypes: true,
    })) {
      const next = relative === "" ? entry.name : `${relative}/${entry.name}`;

      if (entry.isDirectory()) {
        if (!unsearchedDirectories.has(entry.name)) {
          walk(next);
        }

        continue;
      }

      if (isConfigFileName(entry.name)) {
        found.push(next);
      }
    }
  };

  walk("");

  return found.toSorted();
};

const configFileProblems = (files: readonly string[]): readonly string[] =>
  files.flatMap((file) => {
    if (!isConfigFileName(file) || allowedConfigFiles.has(file)) {
      return [];
    }

    if (allowedOtherConfigFiles.has(file)) {
      return [];
    }

    return [
      `${file} is a second Oxlint config. Fix: keep oxlint.config.ts as the only Oxlint config in the repo, or list the path in allowedOtherConfigFiles in scripts/lint-fence.test.ts with a reason, because a nested or extended config turns rules off where the root config cannot see it.`,
    ];
  });

const scriptProblems = (
  file: string,
  scripts: Readonly<Record<string, string>>
): readonly string[] => {
  const body = scripts.lint;

  if (body === undefined) {
    return [];
  }

  return body === LINT_COMMAND
    ? []
    : [
        `${file} script "lint" runs ${JSON.stringify(body)}. Fix: ${JSON.stringify(LINT_COMMAND)} is the only allowed package lint command, compared by equality, so a different body is a different lint run.`,
      ];
};

const rootScriptProblems = (
  scripts: Readonly<Record<string, string>>
): readonly string[] =>
  [...rootScripts].flatMap(([name, expected]) =>
    scripts[name] === expected
      ? []
      : [
          `package.json script "${name}" is ${JSON.stringify(scripts[name])}, and the fixed table pins ${JSON.stringify(expected)}. Fix: restore it, or change the table in scripts/lint-fence.test.ts in the same commit, so the fence keeps running from \`pnpm test\` and CI.`,
        ]
  );

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

const trackedFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
    .split("\0")
    .filter((file) => file !== "");

const trackedSourceFiles = (): readonly string[] =>
  trackedFiles().filter(isScannedSource);

const scriptsOf = (file: string): Readonly<Record<string, string>> =>
  Schema.decodeSync(PackageManifest)(
    readFileSync(path.join(repoRoot, file), "utf-8")
  ).scripts ?? {};

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
      "Fix: pnpm-workspace.yaml must keep its `packages:` list, so the fence finds every workspace package instead of trusting an allowlist."
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

interface CanaryFamily {
  readonly name: string;
  readonly plugin: string;
  readonly rule: string;
  readonly source: string;
}

const canaryFamilies: readonly CanaryFamily[] = [
  {
    name: "debugger",
    plugin: "eslint",
    rule: "no-debugger",
    source: "debugger;\n",
  },
  {
    name: "alert",
    plugin: "eslint",
    rule: "no-alert",
    source: 'alert("fence");\n',
  },
  {
    name: "comment",
    plugin: "no-comments",
    rule: "no-comments",
    source: "// a prose comment stands in for a rule family\n",
  },
  {
    name: "mutable-state",
    plugin: "rat-stack-patterns",
    rule: "no-module-level-mutable-state",
    source: "export let fenceCounter = 0;\n",
  },
  {
    name: "array-passes",
    plugin: "anti-slop",
    rule: "no-array-filter-map",
    source:
      "export const fenceDoubled = [1, 2, 3].filter((n) => n > 1).map((n) => n * 2);\n",
  },
  {
    name: "floating-promise",
    plugin: "typescript",
    rule: "no-floating-promises",
    source: "Promise.resolve();\n",
  },
];

const canaryFile = (family: CanaryFamily): string =>
  `src/fence-canary-${family.name}.ts`;

const canaryPath = (directory: string, family: CanaryFamily): string =>
  `${directory}/${canaryFile(family)}`;

const mirroredFiles = [
  "oxlint.config.ts",
  ".eslintignore",
  "package.json",
  "tsconfig.base.json",
  "tsconfig.json",
];

const writeFileWithParents = (
  root: string,
  relative: string,
  contents: string
): void => {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), contents);
};

const mirroredPluginFiles = [
  "scripts/oxlint-plugin-boundaries.ts",
  "scripts/oxlint-plugin-effect-tests.ts",
  "scripts/oxlint-plugin-no-comments.ts",
  "scripts/oxlint-plugin-patterns.ts",
  "tools/oxlint/anti-slop/index.ts",
  "tools/oxlint/anti-slop/effect/index.ts",
];

const buildMirror = (root: string, directories: readonly string[]): void => {
  for (const entry of mirroredFiles) {
    if (existsSync(path.join(repoRoot, entry))) {
      copyFileSync(path.join(repoRoot, entry), path.join(root, entry));
    }
  }

  symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(root, "node_modules")
  );

  for (const plugin of mirroredPluginFiles) {
    mkdirSync(path.dirname(path.join(root, plugin)), { recursive: true });
    symlinkSync(path.join(repoRoot, plugin), path.join(root, plugin));
  }

  for (const directory of directories) {
    mkdirSync(path.join(root, directory), { recursive: true });
    copyFileSync(
      path.join(repoRoot, directory, "package.json"),
      path.join(root, directory, "package.json")
    );

    const modules = path.join(repoRoot, directory, "node_modules");

    if (existsSync(modules)) {
      symlinkSync(modules, path.join(root, directory, "node_modules"));
    }

    for (const family of canaryFamilies) {
      writeFileWithParents(root, canaryPath(directory, family), family.source);
    }
  }
};

interface OxlintRun {
  readonly status: number | null;
  readonly output: string;
}

interface PackageRun {
  readonly directory: string;
  readonly run: OxlintRun;
}

const runOxlint = async (
  cwd: string,
  args: readonly string[]
): Promise<OxlintRun> => {
  const child = spawn(oxlintBinary, [...args], { cwd });
  let output = "";

  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  await once(child, "close");

  return { output, status: child.exitCode };
};

const runInPackages = (
  root: string,
  directories: readonly string[],
  args: readonly string[]
): Promise<readonly PackageRun[]> =>
  Promise.all(
    directories.map(async (directory) => ({
      directory,
      run: await runOxlint(path.join(root, directory), args),
    }))
  );

const reportedLine = (
  run: OxlintRun,
  file: string,
  plugin: string,
  rule: string
): readonly string[] =>
  run.output
    .split("\n")
    .filter((line) => line.startsWith(`${file}:1:`))
    .filter((line) => line.includes(` error ${plugin}(${rule}):`));

const missingCanaries = (runs: readonly PackageRun[]): readonly string[] =>
  runs.flatMap(({ directory, run }) =>
    canaryFamilies.flatMap((family) =>
      reportedLine(run, canaryFile(family), family.plugin, family.rule)
        .length === 0
        ? [
            `${canaryPath(directory, family)} holds a ${family.name} violation and Oxlint never reported ${family.plugin}(${family.rule}) for it.`,
          ]
        : []
    )
  );

const stillReported = async (
  root: string,
  directories: readonly string[],
  config: string,
  family: CanaryFamily
): Promise<readonly string[]> => {
  const runs = await runInPackages(root, directories, [
    "--config",
    config,
    ".",
  ]);

  return runs.flatMap(({ directory, run }) =>
    reportedLine(run, canaryFile(family), family.plugin, family.rule).length > 0
      ? [directory]
      : []
  );
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

const commandMutations: readonly string[] = [
  "oxlint -Aall .",
  "oxlint --allow all .",
  'oxlint --allow "all" .',
  "oxlint -A all .",
  "oxlint --allow=off .",
  "oxlint -W all .",
  "oxlint test",
  "oxlint src",
  "oxlint",
  "oxlint . --quiet",
  "oxlint . --silent",
  "oxlint . --max-warnings=5",
  "oxlint . --disable-nested-config",
  "oxlint . --disable-oxlint-rules",
  "oxlint --config .oxlintrc.json .",
  "oxlint . && true",
  "ultracite check",
  "pnpm format:check",
  "pnpm run lint",
  "npm run format:check",
  "npx oxlint .",
  "pnpm dlx oxlint .",
  "echo lint passed",
  " oxlint .",
  "oxlint  .",
  "OXLINT .",
  "oxlint ./",
  "oxlint *",
  "oxlint . .",
  "oxlint --fix .",
];

const configOffRules: readonly string[] = [
  "no-debugger",
  "no-alert",
  "no-comments/no-comments",
  "rat-stack-patterns/no-module-level-mutable-state",
  "anti-slop/no-array-filter-map",
  "typescript/no-floating-promises",
  "promise/prefer-await-to-then",
  "eslint/no-console",
];

const configIgnorePatterns: readonly string[] = [
  "packages/**",
  "packages/*/src/**",
  "**/*.test.ts",
  "apps/**",
  "**/fence-canary-*.ts",
  "packages/*",
  "**/*.ts",
];

const configFileNames: readonly string[] = [
  ".oxlintrc.json",
  ".oxlintrc",
  ".oxlintrc.jsonc",
  "oxlint.config.ts",
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.cjs",
];

const configDirectories: readonly string[] = [
  "packages/core",
  "packages/settings/src",
  "apps/web",
  "examples/tokenmaxx-starter",
  "scripts",
  ".",
];

interface Mutation {
  readonly kind: string;
  readonly label: string;
  readonly reject: () => readonly string[];
}

const scriptMutation = (body: string): Mutation => ({
  kind: "package-lint-script",
  label: `package lint script ${JSON.stringify(body)}`,
  reject: () => scriptProblems("packages/core/package.json", { lint: body }),
});

const rootScriptMutation = (name: string): Mutation => ({
  kind: "root-script",
  label: `root script "${name}" replaced`,
  reject: () =>
    rootScriptProblems({ ...Object.fromEntries(rootScripts), [name]: "true" }),
});

const ignoreMutation = (pattern: string): Mutation => ({
  kind: "ignore-pattern",
  label: `oxlint.config.ts ignorePatterns gains ${pattern}`,
  reject: () =>
    ignorePatternProblems([
      ...(core.ignorePatterns ?? []),
      ...repoIgnorePatterns,
      pattern,
    ]),
});

const offRuleMutation = (
  rule: string,
  placement: "off" | "warn"
): Mutation => ({
  kind: "weakened-rule",
  label: `${rule} set to ${placement} for **/*.ts`,
  reject: () =>
    ruleFenceProblems(
      placement === "off"
        ? { overrides: [{ files: ["**/*.ts"], rules: { [rule]: "off" } }] }
        : { rules: { [rule]: "warn" } },
      offRuleAllowlist
    ),
});

const configFileMutation = (file: string): Mutation => ({
  kind: "second-config",
  label: `${file} as a second Oxlint config`,
  reject: () =>
    configFileProblems([
      "oxlint.config.ts",
      "examples/tokenmaxx-starter/.oxlintrc.json",
      file,
    ]),
});

const extraExtends: OxlintConfig = {
  ignorePatterns: ["packages/**"],
  rules: { "no-alert": "off" },
};

const extendsMutation = (index: number): Mutation => ({
  kind: "extends",
  label: `extends entry added at index ${index}`,
  reject: () =>
    extendsProblems(index === 0 ? [extraExtends, core] : [core, extraExtends]),
});

const secondConfigPaths: readonly string[] = configDirectories.flatMap(
  (directory) => {
    const prefix = directory === "." ? "" : `${directory}/`;

    return configFileNames.flatMap((name) =>
      `${prefix}${name}` === "oxlint.config.ts" ||
      `${prefix}${name}` === "examples/tokenmaxx-starter/.oxlintrc.json"
        ? []
        : [`${prefix}${name}`]
    );
  }
);

const mutationBuilders: readonly ((random: () => number) => Mutation)[] = [
  (random) => scriptMutation(pick(random, commandMutations)),
  (random) => rootScriptMutation(pick(random, [...rootScripts.keys()])),
  (random) => ignoreMutation(pick(random, configIgnorePatterns)),
  (random) =>
    offRuleMutation(
      pick(random, configOffRules),
      pick(random, ["off", "warn"] as const)
    ),
  (random) => configFileMutation(pick(random, secondConfigPaths)),
  (random) => extendsMutation(pick(random, [0, 1])),
];

const baselineMutations: readonly Mutation[] = [
  {
    kind: "baseline",
    label: "the real package lint command on its own",
    reject: () =>
      scriptProblems("packages/core/package.json", { lint: LINT_COMMAND }),
  },
  {
    kind: "baseline",
    label: "a package with no lint script",
    reject: () =>
      scriptProblems("packages/core/package.json", { test: "vitest" }),
  },
  {
    kind: "baseline",
    label: "the real root scripts",
    reject: () => rootScriptProblems(Object.fromEntries(rootScripts)),
  },
  {
    kind: "baseline",
    label: "the real ignorePatterns",
    reject: () =>
      ignorePatternProblems([
        ...(core.ignorePatterns ?? []),
        ...repoIgnorePatterns,
      ]),
  },
  {
    kind: "baseline",
    label: "the real extends",
    reject: () => extendsProblems(lintConfig.extends ?? []),
  },
  {
    kind: "baseline",
    label: "the real tracked config paths",
    reject: () => configFileProblems(repoConfigFiles()),
  },
];

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

  it("keeps the Oxlint config at full strength and nothing else extends it", () => {
    expect(
      readFileSync(path.join(repoRoot, "oxlint.config.ts"), "utf-8"),
      "Ultracite check only counts as the real linter while oxlint.config.ts extends the Ultracite Oxlint config. Fix: restore the `ultracite/oxlint/core` import in oxlint.config.ts."
    ).toContain("ultracite/oxlint");
    expect(
      extendsProblems(lintConfig.extends ?? []),
      "oxlint.config.ts extends configs the fixed table does not allow. Fix: keep extends to the imported ultracite/oxlint/core object alone."
    ).toEqual([]);
    expect(
      ignorePatternProblems(lintConfig.ignorePatterns ?? []),
      "oxlint.config.ts ignores paths the fixed table does not list, or stopped ignoring a listed one. Fix: list every ignore pattern in repoIgnorePatterns in scripts/lint-fence.test.ts, so hiding files needs a written reason."
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

  it("allows one Oxlint config file and one listed example config", () => {
    const configFiles = repoConfigFiles();

    expect(
      configFiles,
      "The fence found no Oxlint config at all. Fix: keep oxlint.config.ts tracked, so the behavioural check runs a config instead of nothing."
    ).toContain("oxlint.config.ts");
    expect(
      configFileProblems(configFiles),
      "A second Oxlint config exists, so a package or an example can turn rules off where the root config cannot see it. Fix: delete it, or list the path in allowedOtherConfigFiles in scripts/lint-fence.test.ts with a reason."
    ).toEqual([]);
  });

  it("pins every package lint script and the root scripts to one exact string", () => {
    const packageProblems = workspaceDirectories().flatMap((directory) =>
      scriptProblems(
        `${directory}/package.json`,
        scriptsOf(`${directory}/package.json`)
      )
    );

    expect(
      workspaceDirectories(),
      "The fence read the workspace from pnpm-workspace.yaml and found no packages. Fix: keep the `packages:` globs in pnpm-workspace.yaml, so the fence checks the real workspace instead of an empty list."
    ).toContain("packages/core");
    expect(
      packageProblems,
      `A package lint script is not ${JSON.stringify(LINT_COMMAND)}. Fix: use that string exactly, because the fence compares by equality and never parses flags.`
    ).toEqual([]);
    expect(
      rootScriptProblems(scriptsOf("package.json")),
      "A root script the fence depends on changed. Fix: restore it, or change rootScripts in scripts/lint-fence.test.ts in the same commit."
    ).toEqual([]);
  });

  it("requires a reason on every disable directive", () => {
    const violations = trackedSourceFiles().flatMap((file) =>
      unreasonedDirectives(file)
    );

    const directiveMarker = [
      "//",
      "oxlint-disable-next-line",
      "no-debugger",
    ].join(" ");

    const bareDirective = `${directiveMarker}\nvoid 0;\n`;
    const reasonedDirective = `${directiveMarker} -- the fixture holds no debugger\nvoid 0;\n`;

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

  it("reports every rule family canary in every workspace package", async () => {
    const directories = workspaceDirectories();
    const root = mkdtempSync(path.join(tmpdir(), "pecunia-lint-fence-"));

    try {
      buildMirror(root, directories);

      expect(
        directories.length,
        "The canary run needs every workspace package. Fix: keep the workspace globs in pnpm-workspace.yaml readable."
      ).toBeGreaterThan(10);

      const runs = await runInPackages(root, directories, ["."]);

      expect(
        runs
          .filter(({ run }) => run.status === 0)
          .map(({ directory }) => directory),
        `Oxlint exits zero in a workspace package that holds a planted violation, so that package's lint script would pass on broken source. Output of the first such run:\n${runs[0]?.run.output ?? ""}`
      ).toEqual([]);
      expect(
        missingCanaries(runs),
        "A workspace package holds one canary per rule family and the repo's own Oxlint config never reports one of them, so that package's source can break while lint passes. Fix: stop excluding that path in oxlint.config.ts, in .eslintignore, in a nested config, or stop weakening the rule."
      ).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("catches a weakened config by name in a real Oxlint run", async () => {
    const directories = workspaceDirectories()
      .filter((directory) => directory.startsWith("packages/"))
      .slice(0, 2);

    const root = mkdtempSync(
      path.join(tmpdir(), "pecunia-lint-fence-mutations-")
    );

    try {
      buildMirror(root, directories);

      const controls = [
        {
          name: "ignorePatterns of packages/**",
          patterns: ["packages/**"],
          rules: {},
          hiddenFamily: "debugger",
        },
        {
          name: "no-debugger off",
          patterns: [],
          rules: { "no-debugger": "off" },
          hiddenFamily: "debugger",
        },
        {
          name: "no-alert off",
          patterns: [],
          rules: { "no-alert": "off" },
          hiddenFamily: "alert",
        },
      ];

      const prepared = controls.flatMap((control, index) => {
        const family = canaryFamilies.find(
          (candidate) => candidate.name === control.hiddenFamily
        );

        if (family === undefined) {
          return [];
        }

        const file = path.join(root, `fence-mutation-${index}.config.ts`);

        writeFileSync(
          file,
          mutationConfigSource(control.patterns, control.rules)
        );

        return [{ control, family, file }];
      });

      expect(
        prepared.length,
        "Fix: every control must name a canary family that exists."
      ).toBe(controls.length);

      const verdicts = await Promise.all(
        prepared.map(async (item) => ({
          ...item,
          hidden: await stillReported(
            root,
            directories,
            item.file,
            item.family
          ),
        }))
      );

      for (const { control, family, hidden } of verdicts) {
        expect(
          hidden,
          `A config that adds ${control.name} must hide the ${family.name} canary from the real Oxlint, or this control proves nothing. Fix: keep the canary inside the paths the mutation covers.`
        ).toEqual([]);
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects every script, config and path mutation the fence must catch", () => {
    const random = seededRandom(20_260_216);

    const rejected = new Map<string, number>();
    const accepted: string[] = [];
    let cases = 0;

    for (let index = 0; index < 640; index += 1) {
      const mutation = pick(random, mutationBuilders)(random);
      const problems = mutation.reject();

      expect(
        problems.length,
        `The fence accepted ${mutation.label}. A mutation the fence accepts is a bypass, so the mutation itself fails this test by name. Fix: make the fence reject ${mutation.label}.`
      ).toBeGreaterThan(0);
      rejected.set(mutation.kind, (rejected.get(mutation.kind) ?? 0) + 1);
      cases += 1;
    }

    for (const baseline of baselineMutations) {
      const problems = baseline.reject();

      expect(
        problems,
        `The fence rejected ${baseline.label}, which is allowed. Fix: keep the fence from rejecting a real baseline.`
      ).toEqual([]);
      accepted.push(baseline.label);
      cases += 1;
    }

    expect(
      cases,
      "The property test must keep at least 600 cases, so shrinking any set is visible."
    ).toBeGreaterThanOrEqual(600);
    expect(
      [...rejected.keys()].toSorted(),
      "Every mutation kind must appear in the generated cases, so no fence layer goes unproven. Fix: keep every mutation builder reachable."
    ).toEqual([
      "extends",
      "ignore-pattern",
      "package-lint-script",
      "root-script",
      "second-config",
      "weakened-rule",
    ]);
    expect(
      accepted.length,
      "The property test must accept the real baselines, so a fence that rejects everything fails here."
    ).toBeGreaterThanOrEqual(3);
    expect(
      [...rejected.values()].reduce((total, count) => total + count, 0),
      "The property test must reject the mutations, so a fence that accepts everything fails here."
    ).toBeGreaterThanOrEqual(500);
  });
});
