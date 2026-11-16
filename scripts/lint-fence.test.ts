// @effect-diagnostics nodeBuiltinImport:off -- This test reads the repository's lint config, package manifest, and tracked source files.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";
import type { DummyRule, OxlintConfig } from "oxlint";
import { describe, expect, it } from "vitest";

import lintConfig from "../oxlint.config.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

const offRuleReasons = {
  "foldkit/command-binding-matches-name":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/command-define-pascal-const":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/got-prefix-requires-submodel-payload":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/got-submodel-message-name":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/got-wrapper-carries-only-routing":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/keyed-required-for-mapped-rows":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/lazy-view-stable-references":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/mount-factory-must-use-element":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-array-index-view-keys":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-child-message-construction-in-root":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-direct-submodel-state-update":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-disabling-dev-guardrails":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-duplicate-onmount-per-element":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-empty-children-array":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-empty-commands-array":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-empty-object-tagged-call":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-empty-to-parent-out-message":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-hand-rolled-command-struct":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-hardcoded-route-strings":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-impure-call-at-decision-time":
    "Foldkit entry modules read the environment while starting up, so the rule would report the one place those reads belong.",
  "foldkit/no-module-level-mutable-state":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-nonportable-server-globals":
    "The web app keeps browser and server modules in one source tree, so the server-globals check would fire on browser code.",
  "foldkit/no-noop-message":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-prevent-default-in-stream-operator":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-raw-dom-event-attributes":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-route-query-constructor-default":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/no-spread-in-modify-fields":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/prefer-callable-message-constructor":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/prefer-command-mapmessage":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/prefer-option-over-nullable-in-model":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/require-fold-for-child-update-result":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/require-rel-for-external-link":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/selection-submodel-factory-at-module-scope":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "foldkit/wrap-child-output-in-got-message":
    "Foldkit program rules describe runtime UI construction, and a test file builds no program or view.",
  "jsdoc/require-param-description":
    "Plain JS files keep JSDoc blocks made only of type tags, so a parameter has no prose description to require.",
  "jsdoc/require-returns-description":
    "Plain JS files keep JSDoc blocks made only of type tags, so a return value has no prose description to require.",
  "promise/prefer-await-to-then":
    "Test files build promise-shaped doubles and request fixtures that the name-based check misreads.",
  "typescript/promise-function-async":
    "It demands async on every promise-returning callback, and Effect handlers and platform methods return promises without it.",
  "unicorn/throw-new-error":
    "Schema.TaggedError construction looks like a thrown value to the rule.",
};

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

const sourceFilePattern = /\.(?:ts|tsx|js|mjs|cts|mts)$/u;

const commentPattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;

const directivePattern =
  /^(?:(?:oxlint|eslint)-disable(?:-next-line|-line)?|@ts-(?:expect-error|ignore|nocheck)|trufflehog:ignore)\b/u;

const typeDirectivePattern = /^@ts-(?:expect-error|ignore|nocheck)\b/u;

const rationalePattern = /\s--\s+\S/u;

const maxWarningsPattern = /--max-warnings(?:=|\s+)(?<count>\d+)/u;

const PackageManifest = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) })
);

const emptyRules: OxlintConfig["rules"] = {};

const rulesOf = (
  rules: OxlintConfig["rules"]
): readonly (readonly [string, DummyRule | undefined])[] =>
  Object.entries(rules ?? emptyRules);

const severityOf = (setting: DummyRule | undefined): string => {
  if (setting === undefined) {
    return "unset";
  }

  return Array.isArray(setting) ? String(setting[0]) : String(setting);
};

const allRuleEntries = (
  config: OxlintConfig
): readonly (readonly [string, DummyRule | undefined])[] => [
  ...rulesOf(config.rules),
  ...(config.overrides ?? []).flatMap((override) => rulesOf(override.rules)),
];

const offRuleNames = (config: OxlintConfig): readonly string[] =>
  [
    ...new Set(
      allRuleEntries(config).flatMap(([name, setting]) =>
        severityOf(setting) === "off" ? [name] : []
      )
    ),
  ].toSorted();

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

const unreasonedDirectives = (file: string): readonly string[] => {
  const source = readFileSync(path.join(repoRoot, file), "utf-8");

  return [...source.matchAll(commentPattern)].flatMap((match) => {
    const text = commentText(match[0]);

    if (!directivePattern.test(text) || hasRationale(text)) {
      return [];
    }

    return [`${file}:${lineAt(source, match.index ?? 0)} ${text}`];
  });
};

const isScannedSource = (file: string): boolean =>
  sourceFilePattern.test(file) &&
  !quotedDirectiveFixtures.has(file) &&
  !ignoredScanPrefixes.some((prefix) => file.startsWith(prefix));

const trackedSourceFiles = (): readonly string[] =>
  execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf-8" })
    .split("\0")
    .filter(isScannedSource);

const readScripts = (): Readonly<Record<string, string>> =>
  Schema.decodeSync(PackageManifest)(
    readFileSync(path.join(repoRoot, "package.json"), "utf-8")
  ).scripts;

const warnsAboveZero = (command: string): boolean => {
  const match = maxWarningsPattern.exec(command);

  return match !== null && Number(match.groups?.count) > 0;
};

const weakenedScripts = (
  scripts: Readonly<Record<string, string>>
): readonly string[] =>
  Object.entries(scripts).flatMap(([name, command]) =>
    /--quiet\b/u.test(command) ||
    /--disable\b/u.test(command) ||
    /--allow\b/u.test(command) ||
    warnsAboveZero(command)
      ? [`${name}: ${command}`]
      : []
  );

const optionsOf = (config: OxlintConfig): OxlintConfig["options"] =>
  config.options;

describe("lint fence", () => {
  const declaredOff = offRuleNames(lintConfig);
  const lintOptions = optionsOf(lintConfig);
  const declaredOffSet = new Set(declaredOff);

  it("turns off only rules the allowlist explains", () => {
    const unexplained = declaredOff.flatMap((name) =>
      Object.hasOwn(offRuleReasons, name) ? [] : [name]
    );

    const stale = Object.keys(offRuleReasons).flatMap((name) =>
      declaredOffSet.has(name) ? [] : [name]
    );

    expect(
      unexplained,
      "A rule is off with no reason in offRuleReasons. Fix: add the rule to offRuleReasons in scripts/lint-fence.test.ts with a one-sentence reason, or turn it back on in oxlint.config.ts."
    ).toEqual([]);
    expect(
      stale,
      "offRuleReasons lists a rule that oxlint.config.ts no longer turns off. Fix: delete that allowlist entry, or turn the rule back off only if Rat Stack really needs it."
    ).toEqual([]);
  });

  it("gives every allowlisted rule a plain sentence", () => {
    const thin = Object.entries(offRuleReasons).flatMap(([name, reason]) =>
      reason.trim().endsWith(".") && reason.trim().length >= 20 ? [] : [name]
    );

    expect(
      thin,
      "Every offRuleReasons value must be one plain sentence of at least 20 characters ending in a period, because the reason is what a reader checks when the rule hides a mistake."
    ).toEqual([]);
  });

  it("keeps every rule at error and the fence rules enabled", () => {
    const weak = allRuleEntries(lintConfig).flatMap(([name, setting]) =>
      ["warn", "allow"].includes(severityOf(setting)) ? [name] : []
    );

    expect(
      weak,
      "A rule is set to warn or allow, which lets its findings pass. Fix: set it to error in oxlint.config.ts, or record an explicit off rule with a reason in offRuleReasons."
    ).toEqual([]);

    for (const name of fenceRuleNames) {
      expect(
        severityOf(lintConfig.rules?.[name]),
        `${name} must stay at error (options allowed) so the fence still reports. Fix: restore it in the rules map in oxlint.config.ts.`
      ).toBe("error");
    }
  });

  it("requires a reason on every disable directive", () => {
    const violations = trackedSourceFiles().flatMap((file) =>
      unreasonedDirectives(file)
    );

    expect(
      violations,
      "A disable directive has no reason. Fix: write `// oxlint-disable-next-line <rule> -- <reason>`, `// @ts-expect-error -- <reason>`, or delete the directive. A bare disable hides the invariant that makes it safe, and this test fails instead."
    ).toEqual([]);
  });

  it("keeps lint running at full strength", () => {
    const scripts = readScripts();
    const lintScript = scripts.lint ?? "";

    expect(
      lintScript,
      "package.json has no lint script. Fix: restore `lint` so the repo still runs Oxlint through Ultracite and checks formatting."
    ).toContain("ultracite check");
    expect(
      lintScript,
      "The lint script no longer runs `oxfmt --check`. Fix: restore the format check in the lint script in package.json."
    ).toContain("oxfmt --check");
    expect(
      weakenedScripts(scripts),
      "A package.json script passes a flag that hides lint findings (--quiet, --disable, --allow, or --max-warnings above 0). Fix: remove the flag so every finding still fails the run."
    ).toEqual([]);
    expect(
      lintOptions?.typeAware,
      "Oxlint must keep type-aware linting on. Fix: restore `options: { typeAware: true }` in oxlint.config.ts."
    ).toBe(true);
    expect(
      lintOptions?.maxWarnings ?? 0,
      "Oxlint must not allow warnings past zero. Fix: remove maxWarnings from oxlint.config.ts, or set it to 0."
    ).toBe(0);
  });
});
