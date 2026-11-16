// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off -- This test copies every tracked file into a scratch directory, symlinks the real node_modules, plants canaries, and runs each workspace package's own lint script and pnpm's own package discovery, in parallel, because one sequential run per package takes longer than the suite may spend.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
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

const LINT_COMMAND = "oxlint --format agent .";

const configFileNamePattern =
  /^(?:\.oxlintrc(?:\.[\w.-]+)?|oxlint\.config\.[cm]?[jt]s)$/u;

const allowedConfigFiles = new Map([
  ["oxlint.config.ts", "the one root Oxlint config"],
]);

const allowedOtherConfigFiles = new Map([
  [
    "examples/tokenmaxx-starter/.oxlintrc.json",
    "the standalone starter example sits outside the pnpm workspace, never imports @pecunia/*, and is copied into a new project rather than linted here, and the root lint run names oxlint.config.ts with --config so this nested config never becomes the config root for examples.",
  ],
]);

const repoIgnorePatterns = [
  "examples/**",
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
  ["lint", "ultracite check --config ./oxlint.config.ts && oxfmt --check ."],
  [
    "check",
    "pnpm run lockfile:check && varlock load && turbo run typecheck typecheck-scripts && ultracite check --config ./oxlint.config.ts && oxfmt --check .",
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

interface CanaryFamily {
  readonly depths: readonly CanaryDepth[];
  readonly name: string;
  readonly plugin: string;
  readonly rule: string;
  readonly source: string;
}

const canaryDepths = ["", "src", "src/a/b/c"] as const;

type CanaryDepth = (typeof canaryDepths)[number];

const allCanaryDepths: readonly CanaryDepth[] = canaryDepths;

const canaryFamilies: readonly CanaryFamily[] = [
  {
    depths: allCanaryDepths,
    name: "debugger",
    plugin: "eslint",
    rule: "no-debugger",
    source: "debugger;\n",
  },
  {
    depths: allCanaryDepths,
    name: "alert",
    plugin: "eslint",
    rule: "no-alert",
    source: 'alert("fence");\n',
  },
  {
    depths: allCanaryDepths,
    name: "comment",
    plugin: "no-comments",
    rule: "no-comments",
    source: "// a prose comment stands in for a rule family\n",
  },
  {
    depths: ["src", "src/a/b/c"],
    name: "mutable-state",
    plugin: "rat-stack-patterns",
    rule: "no-module-level-mutable-state",
    source: "export let fenceCounter = 0;\n",
  },
  {
    depths: allCanaryDepths,
    name: "array-passes",
    plugin: "anti-slop",
    rule: "no-array-filter-map",
    source:
      "export const fenceDoubled = [1, 2, 3].filter((n) => n > 1).map((n) => n * 2);\n",
  },
  {
    depths: allCanaryDepths,
    name: "floating-promise",
    plugin: "typescript",
    rule: "no-floating-promises",
    source: "Promise.resolve();\n",
  },
];

interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
}

const PnpmPackageList = Schema.Array(
  Schema.Struct({ name: Schema.String, path: Schema.String })
);

const ManifestRecord = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown)
);

const diagnosticLineLimit = 40;

const childEnv = { ...process.env, CI: "true", NO_COLOR: "1" };

const pnpmConfigArgs = ["--config.verify-deps-before-run=false"];

const installStateFiles: ReadonlySet<string> = new Set([
  ".modules.yaml",
  ".pnpm-workspace-state-v1.json",
]);

const allowedUnlistedManifests = new Map([
  [
    "examples/tokenmaxx-starter/package.json",
    "the standalone starter example sits outside the pnpm workspace, never imports @pecunia/*, and is copied into a new project rather than linted here.",
  ],
  [
    "apps/cli/npm/ratstack/package.json",
    "the published npm shim for the CLI holds a bin launcher and a README, sits inside apps/cli, and the apps/cli lint run walks that directory with everything else.",
  ],
]);

interface CommandRun {
  readonly command: string;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const firstLines = (text: string, limit: number): string => {
  const lines = text.split("\n");

  if (lines.length <= limit) {
    return text;
  }

  return `${lines.slice(0, limit).join("\n")}\n... ${lines.length - limit} more lines`;
};

const describeRun = (run: CommandRun): string =>
  [
    `Command: ${run.command}`,
    `Exit code: ${run.status}`,
    `stdout, first ${diagnosticLineLimit} lines:\n${firstLines(run.stdout, diagnosticLineLimit)}`,
    `stderr, first ${diagnosticLineLimit} lines:\n${firstLines(run.stderr, diagnosticLineLimit)}`,
  ].join("\n\n");

const scratchEntries = (root: string, limit: number): readonly string[] => {
  const listing: string[] = [];
  const pending: string[] = [""];

  while (pending.length > 0 && listing.length < limit) {
    const relative = pending.shift();

    if (relative === undefined) {
      break;
    }

    const entries = readdirSync(path.join(root, relative), {
      withFileTypes: true,
    }).toSorted((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (listing.length >= limit) {
        break;
      }

      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;

      listing.push(entry.isSymbolicLink() ? `${child} (symlink)` : child);

      if (entry.isDirectory()) {
        pending.push(child);
      }
    }
  }

  return listing;
};

const scratchListing = (root: string): string => {
  const listing = scratchEntries(root, diagnosticLineLimit);

  return listing.length === 0 ? "(no entries)" : listing.join("\n");
};

const writeFileWithParents = (
  root: string,
  relative: string,
  contents: string
): void => {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), contents);
};

const runSync = (
  command: string,
  args: readonly string[],
  cwd: string
): CommandRun => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: childEnv,
    maxBuffer: 64 * 1024 * 1024,
  });

  return {
    command: `${command} ${args.join(" ")} with cwd ${cwd}`,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

const runAsync = async (
  command: string,
  args: readonly string[],
  cwd: string
): Promise<CommandRun> => {
  const child = spawn(command, args, { cwd, env: childEnv });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  await once(child, "close");

  return {
    command: `${command} ${args.join(" ")} with cwd ${cwd}`,
    status: child.exitCode,
    stderr,
    stdout,
  };
};

const discoverPackages = (root: string): readonly WorkspacePackage[] => {
  const run = runSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], root);

  if (run.status !== 0) {
    throw new Error(
      `Fix: the fence lists workspace packages with pnpm itself and never expands workspace globs, so \`pnpm list -r --depth -1 --json\` must succeed.\n\n${describeRun(run)}`
    );
  }

  return Schema.decodeSync(Schema.fromJsonString(PnpmPackageList))(run.stdout)
    .flatMap((entry) => {
      const directory = path.relative(root, entry.path);

      return directory === "" ? [] : [{ directory, name: entry.name }];
    })
    .toSorted((left, right) => left.directory.localeCompare(right.directory));
};

const linkDirectoryEntries = (
  source: string,
  target: string,
  skipped: ReadonlySet<string>
): void => {
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(source)) {
    if (!skipped.has(entry)) {
      symlinkSync(path.join(source, entry), path.join(target, entry));
    }
  }
};

const linkPackageModules = (root: string, directory: string): void => {
  const source = path.join(repoRoot, directory, "node_modules");
  const target = path.join(root, directory, "node_modules");

  if (existsSync(source) && !existsSync(target)) {
    symlinkSync(source, target);
  }
};

const buildScratch = (root: string): void => {
  for (const file of trackedFiles()) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(repoRoot, file), target);
  }

  linkDirectoryEntries(
    path.join(repoRoot, "node_modules"),
    path.join(root, "node_modules"),
    installStateFiles
  );

  for (const workspace of discoverPackages(root)) {
    linkPackageModules(root, workspace.directory);
  }
};

const manifestScripts = (
  root: string,
  directory: string
): Readonly<Record<string, string>> =>
  Schema.decodeSync(PackageManifest)(
    readFileSync(path.join(root, directory, "package.json"), "utf-8")
  ).scripts ?? {};

interface CanaryPlanting {
  readonly family: CanaryFamily;
  readonly relative: string;
}

const canaryPlantings: readonly CanaryPlanting[] = canaryFamilies.flatMap(
  (family) =>
    family.depths.map((depth) => ({
      family,
      relative: `${depth === "" ? "" : `${depth}/`}fence-canary-${family.name}.ts`,
    }))
);

const plantCanaries = (root: string, directory: string): void => {
  for (const planting of canaryPlantings) {
    writeFileWithParents(
      root,
      `${directory}/${planting.relative}`,
      planting.family.source
    );
  }
};

const reportedCanary = (run: CommandRun, planting: CanaryPlanting): boolean =>
  run.stdout
    .split("\n")
    .some(
      (line) =>
        line.startsWith(`${planting.relative}:`) &&
        line.includes(
          ` error ${planting.family.plugin}(${planting.family.rule}):`
        )
    );

const lintRunArgs = [...pnpmConfigArgs, "run", "lint"];

const scriptProblemsIn = (
  root: string,
  directory: string
): readonly string[] => {
  const manifest = path.join(root, directory, "package.json");

  if (!existsSync(manifest)) {
    return [
      `${directory} is a workspace package with no package.json, so the fence has no lint script to run for it.`,
    ];
  }

  const body = manifestScripts(root, directory).lint;

  if (body === undefined) {
    return [
      `${directory}/package.json declares no "lint" script, so nothing in that package is linted by the package itself. Fix: add "lint": ${JSON.stringify(LINT_COMMAND)} to ${directory}/package.json.`,
    ];
  }

  return body === LINT_COMMAND
    ? []
    : [
        `${directory}/package.json "lint" runs ${JSON.stringify(body)}, and the fence only runs ${JSON.stringify(LINT_COMMAND)}. Fix: use that string exactly, because a different button is a different lint run.`,
      ];
};

interface PackageProof {
  readonly directory: string;
  readonly name: string;
  readonly problems: readonly string[];
  readonly run?: CommandRun;
}

const provePackage = async (
  root: string,
  workspace: WorkspacePackage
): Promise<PackageProof> => {
  const problems = scriptProblemsIn(root, workspace.directory);

  if (problems.length > 0) {
    return { directory: workspace.directory, name: workspace.name, problems };
  }

  plantCanaries(root, workspace.directory);

  const run = await runAsync(
    "pnpm",
    lintRunArgs,
    path.join(root, workspace.directory)
  );

  const missing = canaryPlantings.flatMap((planting) =>
    reportedCanary(run, planting)
      ? []
      : [
          `${workspace.directory}/${planting.relative} holds a ${planting.family.name} violation and ${workspace.name} never reported ${planting.family.plugin}(${planting.family.rule}) for it when its own lint script ran.`,
        ]
  );

  const silentPass =
    missing.length === 0 && run.status === 0
      ? [
          `${workspace.name} reported every canary and still exited zero, so a caller reading only the exit code sees a clean run. Fix: keep the lint script failing on findings.`,
        ]
      : [];

  return {
    directory: workspace.directory,
    name: workspace.name,
    problems: [...missing, ...silentPass],
    run,
  };
};

const mapWithLimit = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>
): Promise<readonly Result[]> => {
  const step = async (start: number): Promise<readonly Result[]> => {
    if (start >= items.length) {
      return [];
    }

    const chunk = await Promise.all(items.slice(start, start + limit).map(run));

    return [...chunk, ...(await step(start + limit))];
  };

  return await step(0);
};

const unlistedManifestProblems = (
  packages: readonly WorkspacePackage[]
): readonly string[] => {
  const listed = new Set(
    packages.map((workspace) => `${workspace.directory}/package.json`)
  );

  return trackedFiles()
    .filter((file) => path.basename(file) === "package.json")
    .filter((file) => file !== "package.json")
    .filter((file) => !listed.has(file))
    .filter((file) => !allowedUnlistedManifests.has(file))
    .map(
      (file) =>
        `${file} is tracked but pnpm does not list its directory as a workspace package, so no package lint run covers it. Fix: keep the directory inside a pnpm-workspace.yaml glob, delete it, or list it in allowedUnlistedManifests in scripts/lint-fence.test.ts with a reason.`
    );
};

interface WorkspaceProof {
  readonly packages: readonly WorkspacePackage[];
  readonly proofs: readonly PackageProof[];
  readonly problems: readonly string[];
}

const proveWorkspace = async (
  root: string,
  directories?: readonly string[],
  known?: readonly WorkspacePackage[]
): Promise<WorkspaceProof> => {
  const packages = known ?? discoverPackages(root);

  const unpreached =
    directories === undefined
      ? []
      : directories.flatMap((directory) =>
          packages.some((workspace) => workspace.directory === directory)
            ? []
            : [
                `${directory} is tracked but pnpm does not list it as a workspace package, so its source can break while lint passes.`,
              ]
        );

  const chosen =
    directories === undefined
      ? packages
      : packages.filter((workspace) =>
          directories.includes(workspace.directory)
        );

  const proofs = await mapWithLimit(chosen, 8, (workspace) =>
    provePackage(root, workspace)
  );

  return {
    packages,
    proofs,
    problems: [
      ...unpreached,
      ...unlistedManifestProblems(packages),
      ...proofs.flatMap((proof) => proof.problems),
    ],
  };
};

const proofDiagnostics = (
  root: string,
  proofs: readonly PackageProof[]
): string =>
  [
    `Scratch directory: ${root}`,
    `Scratch files:\n${scratchListing(root)}`,
    ...proofs
      .filter((proof) => proof.problems.length > 0)
      .slice(0, 3)
      .flatMap((proof) => [
        `${proof.directory} (${proof.name}):`,
        proof.run === undefined
          ? "its lint script never ran"
          : describeRun(proof.run),
      ]),
  ].join("\n\n");

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

const packageIgnorePatterns = [
  "src",
  "src/",
  "src/**",
  "src/*",
  "src/a/**",
  "src/a/b/**",
  "src/a/b/c/**",
  "**/fence-canary-*.ts",
  "*.ts",
] as const;

const rootIgnorePatternsFor = (directory: string): readonly string[] => [
  `${directory}/src`,
  `${directory}/src/`,
  `${directory}/src/**`,
  `${directory}/src/*`,
  `${directory}/src/a/**`,
  `${directory}/src/a/b/c/**`,
  `${directory}/**/fence-canary-*.ts`,
  `${directory}/fence-canary-debugger.ts`,
  `**/fence-canary-*.ts`,
];

const packageOffRules = [
  "no-debugger",
  "no-alert",
  "no-comments/no-comments",
  "rat-stack-patterns/no-module-level-mutable-state",
  "anti-slop/no-array-filter-map",
  "typescript/no-floating-promises",
] as const;

const replacedScripts = [
  "echo lint passed",
  "true",
  "oxlint",
  "oxlint test",
  "oxlint src",
  "oxlint src/a",
  "oxlint --format agent src",
  "pnpm format:check",
  "oxfmt --check .",
  "pnpm run format:check",
  "ultracite check",
] as const;

interface AppliedMutation {
  readonly label: string;
  readonly rediscovers: boolean;
  readonly targets: readonly string[];
  readonly undo: () => void;
}

interface MutationContext {
  readonly root: string;
  readonly packages: readonly WorkspacePackage[];
}

const backupFile = (root: string, relative: string): (() => void) => {
  const file = path.join(root, relative);
  const before = existsSync(file) ? readFileSync(file, "utf-8") : undefined;

  return () => {
    if (before === undefined) {
      rmSync(file, { force: true });

      return;
    }

    writeFileSync(file, before);
  };
};

const rewriteFile = (
  root: string,
  relative: string,
  rewrite: (before: string) => string
): (() => void) => {
  const file = path.join(root, relative);
  const before = readFileSync(file, "utf-8");

  writeFileSync(file, rewrite(before));

  return () => {
    writeFileSync(file, before);
  };
};

const rewriteScripts = (
  before: string,
  rewrite: (
    scripts: Readonly<Record<string, string>>
  ) => Readonly<Record<string, string>>
): string =>
  `${JSON.stringify(
    {
      ...Schema.decodeSync(ManifestRecord)(before),
      scripts: rewrite(
        Schema.decodeSync(PackageManifest)(before).scripts ?? {}
      ),
    },
    null,
    2
  )}\n`;

const mutationBuilders: readonly ((
  context: MutationContext,
  random: () => number
) => AppliedMutation)[] = [
  (context, random) => {
    const workspace = pick(random, context.packages);
    const pattern = pick(random, packageIgnorePatterns);
    const file = path.join(context.root, workspace.directory, ".eslintignore");

    writeFileSync(file, `${pattern}\n`);

    return {
      label: `${workspace.directory}/.eslintignore holding ${JSON.stringify(pattern)}`,
      rediscovers: false,
      targets: [workspace.directory],
      undo: () => {
        rmSync(file, { force: true });
      },
    };
  },
  (context, random) => {
    const workspace = pick(random, context.packages);
    const pattern = pick(random, rootIgnorePatternsFor(workspace.directory));
    const restore = backupFile(context.root, ".eslintignore");

    writeFileWithParents(context.root, ".eslintignore", `${pattern}\n`);

    return {
      label: `root .eslintignore holding ${JSON.stringify(pattern)}`,
      rediscovers: false,
      targets: [workspace.directory],
      undo: restore,
    };
  },
  (context, random) => {
    const workspace = pick(random, context.packages);
    const pattern = pick(random, rootIgnorePatternsFor(workspace.directory));

    const undo = rewriteFile(context.root, "oxlint.config.ts", (before) =>
      before.replace(
        "  ignorePatterns: [",
        `  ignorePatterns: [\n    ${JSON.stringify(pattern)},`
      )
    );

    return {
      label: `oxlint.config.ts ignorePatterns gaining ${JSON.stringify(pattern)}`,
      rediscovers: false,
      targets: [workspace.directory],
      undo,
    };
  },
  (context, random) => {
    const workspace = pick(random, context.packages);
    const rule = pick(random, packageOffRules);
    const file = path.join(context.root, workspace.directory, ".oxlintrc.json");

    writeFileSync(file, `${JSON.stringify({ rules: { [rule]: "off" } })}\n`);

    return {
      label: `${workspace.directory}/.oxlintrc.json turning ${rule} off`,
      rediscovers: false,
      targets: [workspace.directory],
      undo: () => {
        rmSync(file, { force: true });
      },
    };
  },
  (context, random) => {
    const workspace = pick(random, context.packages);
    const body = pick(random, replacedScripts);

    const undo = rewriteFile(
      context.root,
      `${workspace.directory}/package.json`,
      (before) =>
        rewriteScripts(before, (scripts) => ({ ...scripts, lint: body }))
    );

    return {
      label: `${workspace.directory} lint script replaced by ${JSON.stringify(body)}`,
      rediscovers: false,
      targets: [workspace.directory],
      undo,
    };
  },
  (context, random) => {
    const workspace = pick(random, context.packages);

    const undo = rewriteFile(
      context.root,
      `${workspace.directory}/package.json`,
      (before) =>
        rewriteScripts(before, (scripts) => {
          const remaining = { ...scripts };
          delete remaining.lint;

          return remaining;
        })
    );

    return {
      label: `${workspace.directory} losing its lint script`,
      rediscovers: false,
      targets: [workspace.directory],
      undo,
    };
  },
  (context, random) => {
    const depth = pick(random, [1, 2, 3] as const);

    const segments = Array.from(
      { length: depth },
      (_, index) => `group${index}`
    );

    const directory = ["modules", ...segments, "fence-demo"].join("/");
    const body = pick(random, replacedScripts);

    const undoWorkspace = rewriteFile(
      context.root,
      "pnpm-workspace.yaml",
      (before) =>
        before.replace('  - "packages/*"', `  - "packages/*"\n  - "modules/**"`)
    );

    writeFileWithParents(
      context.root,
      `${directory}/package.json`,
      `${JSON.stringify(
        {
          name: "@pecunia/fence-demo",
          private: true,
          version: "0.1.0",
          scripts: { lint: body },
        },
        null,
        2
      )}\n`
    );

    return {
      label: `new package ${directory} with lint script ${JSON.stringify(body)}`,
      rediscovers: true,
      targets: [directory],
      undo: () => {
        undoWorkspace();
        rmSync(path.join(context.root, "modules"), {
          force: true,
          recursive: true,
        });
      },
    };
  },
  (context, random) => {
    const workspace = pick(
      random,
      context.packages.filter((candidate) =>
        candidate.directory.startsWith("packages/")
      )
    );

    const moved = `modules/${path.basename(workspace.directory)}`;

    mkdirSync(path.join(context.root, "modules"), { recursive: true });
    renameSync(
      path.join(context.root, workspace.directory),
      path.join(context.root, moved)
    );

    return {
      label: `${workspace.directory} moved to ${moved}, outside every workspace glob`,
      rediscovers: true,
      targets: [workspace.directory],
      undo: () => {
        renameSync(
          path.join(context.root, moved),
          path.join(context.root, workspace.directory)
        );
        rmSync(path.join(context.root, "modules"), {
          force: true,
          recursive: true,
        });
      },
    };
  },
];

const mutationCaseCount = 300;

const mutationWorkerCount = 12;

const mutationSeed = 20_260_216;

const baselinePackage = "packages/core";

const freshScratch = (label: string): string =>
  mkdtempSync(path.join(tmpdir(), `pecunia-lint-fence-${label}-`));

const namesTarget = (
  targets: readonly string[],
  problems: readonly string[]
): boolean =>
  targets.some((target) =>
    problems.some((problem) => problem.includes(target))
  );

const runMutationCase = async (
  root: string,
  packages: readonly WorkspacePackage[],
  seed: number
): Promise<readonly string[]> => {
  const random = seededRandom(seed);
  const mutation = pick(random, mutationBuilders)({ root, packages }, random);

  try {
    const proof = await proveWorkspace(
      root,
      mutation.targets,
      mutation.rediscovers ? undefined : packages
    );

    return namesTarget(mutation.targets, proof.problems)
      ? []
      : [
          `${mutation.label} (seed ${seed}) left the fence passing: ${proof.problems.length === 0 ? "no problem at all" : proof.problems.join(" ")}`,
        ];
  } finally {
    mutation.undo();
  }
};

const runMutationWorker = async (
  workerIndex: number,
  cases: number
): Promise<readonly string[]> => {
  const root = freshScratch(`case-${workerIndex}`);
  const failures: string[] = [];

  try {
    buildScratch(root);

    const baseline = await proveWorkspace(root, [baselinePackage]);

    if (baseline.problems.length > 0) {
      failures.push(
        `The unmutated scratch copy failed its own baseline: ${baseline.problems.join(" ")}\n\n${proofDiagnostics(root, baseline.proofs)}`
      );
    }

    for (let index = 0; index < cases; index += 1) {
      const caseIndex = workerIndex * cases + index;

      // oxlint-disable-next-line no-await-in-loop, anti-slop/no-await-in-loop -- every case mutates the same scratch directory, so they run one at a time.
      const caseFailures = await runMutationCase(
        root,
        baseline.packages,
        mutationSeed + caseIndex
      );

      failures.push(...caseFailures);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }

  return failures;
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
    expect(
      trackedFiles().filter((file) => path.basename(file) === ".eslintignore"),
      "A tracked .eslintignore hides whatever paths it names from Oxlint, including real source directories a canary never lands in, and no written table lists it. Fix: delete it and ignore paths through ignorePatterns in oxlint.config.ts, where repoIgnorePatterns in scripts/lint-fence.test.ts records each one with a reason."
    ).toEqual([]);
  });

  it("pins every package lint script and the root scripts to one exact string", () => {
    const packages = discoverPackages(repoRoot);

    expect(
      packages.map((workspace) => workspace.directory),
      "pnpm listed no workspace packages, so the fence would check nothing. Fix: keep pnpm-workspace.yaml readable and node_modules installed before running the guards."
    ).toContain("packages/core");
    expect(
      packages.flatMap((workspace) =>
        scriptProblemsIn(repoRoot, workspace.directory)
      ),
      `A package lint script is not ${JSON.stringify(LINT_COMMAND)}. Fix: use that string exactly, because the fence runs that script and reads Oxlint's agent format, and it never parses flags.`
    ).toEqual([]);
    expect(
      unlistedManifestProblems(packages),
      "A tracked package.json is not a workspace package, so nothing lints its directory. Fix: keep it inside a pnpm-workspace.yaml glob, delete it, or list it in allowedUnlistedManifests in scripts/lint-fence.test.ts with a reason."
    ).toEqual([]);
    expect(
      rootScriptProblems(scriptsOf("package.json")),
      "A root script the fence depends on changed. Fix: restore it, or change rootScripts in scripts/lint-fence.test.ts in the same commit."
    ).toEqual([]);
  });

  it(
    "keeps the real root lint command off examples on a clean copy of the repo",
    { timeout: 900_000 },
    async () => {
      const root = freshScratch("root-lint");

      try {
        buildScratch(root);

        writeFileWithParents(
          root,
          "examples/fence-root-lint-canary.ts",
          "debugger;\n"
        );

        const run = await runAsync("pnpm", lintRunArgs, root);

        const ignored = run.stdout
          .split("\n")
          .filter((line) => /^examples\/[^:]+:\d+:\d+:/u.test(line));

        expect(
          ignored,
          `The root \`lint\` script is ${JSON.stringify(scriptsOf("package.json").lint)} and it reported files under examples/ on a clean copy of the repo, where a canary violation sits. examples/ is ignored through repoIgnorePatterns, and Oxlint only honours that table when the run names its config, because a config inside examples/ otherwise becomes the config root for that subtree and drops the parent ignorePatterns. Fix: keep "examples/**" in oxlint.config.ts and --config ./oxlint.config.ts in the root lint script.\n\n${describeRun(run)}`
        ).toEqual([]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    }
  );

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

  it(
    "reports every rule family canary at three depths in every workspace package",
    { timeout: 900_000 },
    async () => {
      const root = freshScratch("workspace");

      try {
        buildScratch(root);

        const proof = await proveWorkspace(root);

        expect(
          proof.packages.map((workspace) => workspace.directory),
          "pnpm listed no workspace packages in the scratch copy, so the canary run proves nothing. Fix: keep pnpm-workspace.yaml readable."
        ).toContain("packages/core");
        expect(
          proof.packages.length,
          "The canary run needs every workspace package. Fix: keep the workspace globs in pnpm-workspace.yaml readable."
        ).toBeGreaterThan(10);
        expect(
          proof.problems,
          `A workspace package holds one canary per rule family at three depths and its own lint script never reported one of them, or pnpm does not list a tracked package at all, so that source can break while lint passes. Fix: stop excluding that path in oxlint.config.ts, in .eslintignore, in a nested config, or stop weakening the rule.\n\n${proofDiagnostics(root, proof.proofs)}`
        ).toEqual([]);
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    }
  );

  it(
    "catches every configuration, script and discovery mutation by package name",
    { timeout: 1_800_000 },
    async () => {
      const casesPerWorker = Math.ceil(mutationCaseCount / mutationWorkerCount);

      const workerFailures = await Promise.all(
        Array.from({ length: mutationWorkerCount }, (_, workerIndex) =>
          runMutationWorker(workerIndex, casesPerWorker)
        )
      );

      const failures = workerFailures.flat();

      expect(
        mutationCaseCount,
        "The property test must keep at least 300 cases, so shrinking the set is visible."
      ).toBeGreaterThanOrEqual(300);
      expect(
        failures,
        `The fence accepted a mutation it must catch, so that mutation is a live bypass. Seed: ${mutationSeed}. Fix: make the real lint run fail for that mutation, naming the package or the file.\n\n${failures.join("\n\n")}`
      ).toEqual([]);
    }
  );
});
