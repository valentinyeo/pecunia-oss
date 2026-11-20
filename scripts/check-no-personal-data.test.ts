// @effect-diagnostics nodeBuiltinImport:off -- This test reads the guard's own allow list from the repository.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  decodeAllowList,
  findPersonalData,
  findingMessage,
  isSkippedPath,
  RULE_IDS,
} from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const root = path.resolve(import.meta.dirname, "..");

const empty: AllowList = { skipped: [], values: [] };

const rulesIn = (file: string, text: string, allow: AllowList = empty) =>
  findPersonalData(file, text, allow).map((finding) => finding.rule);

const joined = (...parts: readonly string[]) => parts.join("");

const dots = (...parts: readonly string[]) => parts.join(".");

const mailbox = `${joined("jo", "e")}@${dots("mail", "host", "co", "uk")}`;

const ibanParts = ["GB82", "WEST", "1234", "5698", "7654", "32"];

const wrongIbanParts = ["GB82", "WEST", "1234", "5698", "7654", "33"];

const hostname = `${joined("planted", "-sample")}.${dots("workers", "dev")}`;

const accountId = joined("0123456789abcdef", "0123456789abcdef");

const sortCode = ["20", "45", "67"].join("-");

const accountNumber = joined("1029", "3847");

describe("rule ids", () => {
  it("declares the five plain-text rules", () => {
    expect(RULE_IDS).toEqual([
      "bank-account",
      "cloudflare-account-id",
      "cloudflare-hostname",
      "email",
      "iban",
    ]);
  });
});

describe("every rule flags its planted case and its quiet twin", () => {
  it("email", () => {
    expect(rulesIn("demo.md", `write to ${mailbox} today`)).toEqual(["email"]);
    expect(
      rulesIn(
        "demo.md",
        "demo@example.com and someone@users.noreply.github.com"
      )
    ).toEqual([]);
  });

  it("iban", () => {
    expect(rulesIn("demo.md", `pay ${ibanParts.join(" ")}`)).toEqual(["iban"]);
    expect(rulesIn("demo.md", "reflow the wrapped words")).toEqual([]);
    expect(rulesIn("demo.md", `pay ${wrongIbanParts.join("")}`)).toEqual([]);
  });

  it("cloudflare-hostname", () => {
    expect(rulesIn("demo.md", `see https://${hostname}`)).toEqual([
      "cloudflare-hostname",
    ]);
    expect(rulesIn("demo.md", "see https://example.workers.dev")).toEqual([]);
  });

  it("cloudflare-account-id", () => {
    expect(rulesIn("demo.md", `account id: ${accountId}`)).toEqual([
      "cloudflare-account-id",
    ]);
    expect(rulesIn("demo.json", `{ "account": "${accountId}" }`)).toEqual([
      "cloudflare-account-id",
    ]);
    expect(rulesIn("demo.md", `hash ${accountId}`)).toEqual([]);
  });

  it("bank-account on one line", () => {
    expect(
      rulesIn("demo.md", `sort ${sortCode} account ${accountNumber}`)
    ).toEqual(["bank-account"]);
    expect(rulesIn("demo.md", `${sortCode} ${accountNumber}`)).toEqual([]);
  });

  it("bank-account across two lines", () => {
    expect(
      rulesIn("demo.md", `sort code ${sortCode}\naccount ${accountNumber}`)
    ).toEqual(["bank-account"]);
    expect(rulesIn("demo.md", `sort ${sortCode}`)).toEqual([]);
  });
});

describe("allow list", () => {
  it("decodes the allow list the guard ships", () => {
    const allow = decodeAllowList(
      readFileSync(
        path.join(root, "scripts/no-personal-data-allow.json"),
        "utf-8"
      )
    );

    expect(allow.skipped.length).toBeGreaterThan(0);
    expect(allow.values.length).toBeGreaterThan(0);
  });

  it("excuses a value only in the path it names", () => {
    const allow: AllowList = {
      skipped: [],
      values: [{ path: "demo.md", reason: "a made-up host", value: hostname }],
    };

    expect(rulesIn("demo.md", `see ${hostname}`, allow)).toEqual([]);
    expect(rulesIn("other.md", `see ${hostname}`, allow)).toEqual([
      "cloudflare-hostname",
    ]);
  });

  it("skips a path it lists", () => {
    const allow: AllowList = {
      skipped: [{ path: "demo.md", reason: "generated output" }],
      values: [],
    };

    expect(isSkippedPath("demo.md", allow)).toBe(true);
    expect(rulesIn("demo.md", `write to ${mailbox}`, allow)).toEqual([]);
  });

  it("names the rule without printing the value", () => {
    const [finding] = findPersonalData("demo.md", `write to ${mailbox}`, empty);
    const message = finding === undefined ? "" : findingMessage(finding);
    expect(message).toContain("demo.md:1:");
    expect(message).not.toContain(mailbox);
  });
});
