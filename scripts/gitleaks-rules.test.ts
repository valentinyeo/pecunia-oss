// @effect-diagnostics nodeBuiltinImport:off -- This test spawns the gitleaks binary and writes its probe files to a temporary directory.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

const config = path.join(root, ".gitleaks.toml");

const available = spawnSync("gitleaks", ["version"]).status === 0;

const Findings = Schema.Array(Schema.Struct({ RuleID: Schema.String }));

const decodeFindings = Schema.decodeUnknownSync(
  Schema.fromJsonString(Findings)
);

const hex = (head: string, tail: string) => `${head}${tail}`;

const commitSha = hex("a1b2c3d4e5f60718", "293a4b5c6d7e8f9012345678");

const pinnedSha = hex("b1c2d3e4f5061728", "394a5b6c7d8e9f0123456789");

const sourcegraphToken = [
  "sgp",
  hex("c1d2e3f4051627384", "9a5b6c7d8e9f0123456789a"),
].join("_");

const fixtureJwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  "signatureValue",
].join(".");

const otherJwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiI5ODc2NTQzMjEwIn0",
  "anotherSignatureValue",
].join(".");

const longValue = hex("Xk3Qw9Zt5Lb7Nc2Md4Pf", "6Rg8Sh1Vj0Wa3Ye5Ui7a");

const scan = (
  name: string,
  text: string
): readonly { readonly RuleID: string }[] => {
  const subject = mkdtempSync(path.join(tmpdir(), "gitleaks-probe-"));
  const reports = mkdtempSync(path.join(tmpdir(), "gitleaks-report-"));
  const report = path.join(reports, "report.json");

  writeFileSync(path.join(subject, name), `${text}\n`);

  try {
    spawnSync("gitleaks", [
      "dir",
      subject,
      "--config",
      config,
      "--report-format",
      "json",
      "--report-path",
      report,
      "--exit-code",
      "0",
      "--no-banner",
    ]);

    return decodeFindings(readFileSync(report, "utf-8") || "[]");
  } finally {
    rmSync(subject, { force: true, recursive: true });
    rmSync(reports, { force: true, recursive: true });
  }
};

const ruleIds = (name: string, text: string) =>
  scan(name, text).map((finding) => finding.RuleID);

describe.runIf(available)("the gitleaks rules", { timeout: 60_000 }, () => {
  it("reports a Sourcegraph token pinned beside a repository sha", () => {
    expect(
      ruleIds(
        "note.md",
        `Token ${sourcegraphToken} for owner/repo#${commitSha}`
      )
    ).toContain("sourcegraph-access-token-prefixed");
  });

  it("reports a Sourcegraph token on a line with a json commit field", () => {
    expect(
      ruleIds(
        "note.json",
        `{"commit": "${commitSha}", "token": "${sourcegraphToken}"}`
      )
    ).toContain("sourcegraph-access-token-prefixed");
  });

  it("reports a second JWT on the fixture line", () => {
    expect(ruleIds("note.md", `${fixtureJwt} and ${otherJwt}`)).toContain(
      "jwt"
    );
  });

  it("passes the fixture JWT alone", () => {
    expect(ruleIds("note.md", `fixture ${fixtureJwt}`)).toEqual([]);
  });

  it("reports the fixture JWT once its signature is extended", () => {
    expect(ruleIds("note.md", `fixture ${fixtureJwt}Extended`)).toContain(
      "jwt"
    );
  });

  it("reports a bare forty character value beside a repository pin", () => {
    expect(
      ruleIds(
        "note.md",
        `sourcegraph digest ${commitSha} pinned at owner/repo#${pinnedSha}`
      )
    ).toContain("sourcegraph-access-token");
  });

  it("reports a Cloudflare shaped token beside a repository pin", () => {
    expect(
      ruleIds(
        "note.md",
        `wrangler token ${longValue} pinned at owner/repo#${pinnedSha}`
      )
    ).toContain("cloudflare-token-named-nearby");
  });

  it("reports a Cloudflare shaped token on a line that cites a commit url", () => {
    expect(
      ruleIds(
        "note.md",
        `cloudflare token ${longValue} https://example.test/owner/repo/blob/${pinnedSha}/src/x.ts`
      )
    ).toContain("cloudflare-token-named-nearby");
  });

  it("passes a commit sha in a json commit field", () => {
    expect(ruleIds("note.json", `{"commit": "${commitSha}"}`)).toEqual([]);
  });

  it("passes a commit sha in a repository pin", () => {
    expect(ruleIds("note.md", `pinned at owner/repo#${pinnedSha}`)).toEqual([]);
  });

  it("reports a second JWT in parentheses", () => {
    expect(ruleIds("note.md", `fixture ${fixtureJwt} (${otherJwt})`)).toContain(
      "jwt"
    );
  });

  it("reports a second JWT ending a comma separated list", () => {
    expect(ruleIds("note.md", `tokens: ${fixtureJwt}, ${otherJwt},`)).toContain(
      "jwt"
    );
  });

  it("passes the fixture JWT inside parentheses", () => {
    expect(ruleIds("note.md", `fixture (${fixtureJwt})`)).toEqual([]);
  });

  it("reports a bare forty character value outside a commit place", () => {
    expect(ruleIds("note.md", `sourcegraph digest ${commitSha}`)).toContain(
      "sourcegraph-access-token"
    );
  });
});
