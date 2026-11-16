import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  BankFileRejected,
  ImportAccountNotFound,
  ProviderAccountIdSchema,
} from "@pecunia/core/bank-import";
import type { ProviderAccountId } from "@pecunia/core/bank-import";
import { Effect, FileSystem, Path, Predicate, Result, Schema } from "effect";

import { importBankFile, listImportTargets } from "../src/capabilities.js";
import { runImportMachine } from "../src/import-machine.js";
import {
  demoAccountId,
  demoLedgerLayer,
  demoProfileId,
  demoTarget,
} from "./bank-fixture.js";

const demoFixture = Effect.gen(function* readDemoFixture() {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return yield* fileSystem.readFileString(
    path.join(import.meta.dirname, "..", "fixtures", "demo-bank.csv")
  );
}).pipe(Effect.provide(NodeServices.layer));

const otherAccountId: ProviderAccountId = Schema.decodeSync(
  ProviderAccountIdSchema
)("0192f0c1-0008-7000-8000-000000000000");

const demoRequest = (
  content: string,
  accountId: ProviderAccountId = demoAccountId
) => ({
  accountId,
  content,
  fileName: "demo-bank.csv",
  profileId: demoProfileId,
});

const refusalOf = (outcome: Result.Result<unknown, unknown>) =>
  Result.isFailure(outcome) ? outcome.failure : undefined;

const reasonsOf = (lines: readonly string[]) =>
  runImportMachine(
    demoRequest(
      ["date,description,amount_minor,currency,reference", ...lines].join("\n")
    )
  ).pipe(
    Effect.provide(demoLedgerLayer),
    Effect.map((summary) => summary.rejected.map((line) => line.reason))
  );

const refusal = (content: string) =>
  runImportMachine(demoRequest(content)).pipe(
    Effect.provide(demoLedgerLayer),
    Effect.result,
    Effect.map(refusalOf)
  );

describe("a demo bank file", () => {
  it.effect("imports every made-up line once", () =>
    Effect.gen(function* importDemoFile() {
      const content = yield* demoFixture;

      const summary = yield* runImportMachine(demoRequest(content));

      expect(summary).toEqual({
        alreadyImported: 0,
        fileName: "demo-bank.csv",
        imported: 5,
        rejected: [],
      });
    }).pipe(Effect.provide(demoLedgerLayer))
  );

  it.effect("adds nothing when the same file is imported again", () =>
    Effect.gen(function* importDemoFileTwice() {
      const content = yield* demoFixture;

      const first = yield* runImportMachine(demoRequest(content));
      const second = yield* runImportMachine(demoRequest(content));

      expect(first.imported).toBe(5);
      expect(second).toEqual({
        alreadyImported: 5,
        fileName: "demo-bank.csv",
        imported: 0,
        rejected: [],
      });
    }).pipe(Effect.provide(demoLedgerLayer))
  );

  it.effect(
    "adds nothing when the same lines arrive reordered, repeated, and semicolon separated",
    () =>
      Effect.gen(function* importRerenderedFile() {
        const content = yield* demoFixture;

        const first = yield* runImportMachine(demoRequest(content));

        const rerendered = [
          "date;description;amount_minor;currency;reference",
          " 2026-02-17 ; Refund from Demo Design Tool ; 3500 ; EUR ; DEMO-2026-0005 ",
          "2026-02-03;Demo Rail ticket;-12000;EUR;DEMO-2026-0004",
          '2026-01-09;"Demo Cloud Hosting, monthly";-29900;EUR;DEMO-2026-0002',
          "2026-01-06;Invoice payment from Example Ltd;480000;EUR;DEMO-2026-0001",
          "2026-01-12;Demo Coffee;4250;EUR;",
          '2026-01-09;"Demo Cloud Hosting, monthly";-29900;EUR;DEMO-2026-0002',
        ].join("\r\n");

        const second = yield* runImportMachine(demoRequest(rerendered));

        expect(first.imported).toBe(5);
        expect(second.imported).toBe(0);
        expect(second.alreadyImported).toBe(6);
      }).pipe(Effect.provide(demoLedgerLayer))
  );

  it.effect("keeps a line that repeats inside one file a single time", () =>
    Effect.gen(function* importRepeatedLine() {
      const content = [
        "date,description,amount_minor,currency,reference",
        "2026-01-12,Demo Coffee,4250,EUR,DEMO-2026-0003",
        "2026-01-12,Demo Coffee,4250,EUR,DEMO-2026-0003",
        "2026-01-12,Demo Coffee,4250,EUR,DEMO-2026-0003",
      ].join("\n");

      const summary = yield* runImportMachine(demoRequest(content));

      expect(summary.imported).toBe(1);
      expect(summary.alreadyImported).toBe(2);
    }).pipe(Effect.provide(demoLedgerLayer))
  );

  it.effect(
    "reports a line that breaks a rule and keeps it out of the ledger",
    () =>
      Effect.gen(function* importBrokenLine() {
        const content = [
          "date,description,amount_minor,currency,reference",
          "2026-01-12,Demo Coffee,4250,EUR,DEMO-2026-0003",
          "2026-02-30,Demo Coffee,4250,EUR,DEMO-2026-0004",
        ].join("\n");

        const first = yield* runImportMachine(demoRequest(content));
        const second = yield* runImportMachine(demoRequest(content));

        expect(first.imported).toBe(1);
        expect(first.rejected).toEqual([
          {
            lineNumber: 3,
            reason: "bad-date",
            text: "2026-02-30,Demo Coffee,4250,EUR,DEMO-2026-0004",
          },
        ]);
        expect(second.imported).toBe(0);
        expect(second.alreadyImported).toBe(1);
        expect(second.rejected).toEqual(first.rejected);
      }).pipe(Effect.provide(demoLedgerLayer))
  );
});

describe("a rejected line", () => {
  it.effect("names each broken rule", () =>
    Effect.gen(function* nameEachBrokenRule() {
      const reasons = yield* reasonsOf([
        "2026-01-12,Demo Coffee",
        "2026-02-30,Demo Coffee,4250,EUR,DEMO-1",
        "2026-01-12,Demo Coffee,42.50,EUR,DEMO-2",
        "2026-01-12,Demo Coffee,4250,eur,DEMO-3",
        "2026-01-12,,4250,EUR,DEMO-4",
        `2026-01-12,${"D".repeat(121)},4250,EUR,DEMO-5`,
        '2026-01-12,"Demo \u0007 Coffee",4250,EUR,DEMO-6',
        "2026-01-12,Demo Coffee,4250,USD,DEMO-7",
      ]);

      expect(reasons).toEqual([
        "field-count",
        "bad-date",
        "bad-amount",
        "bad-currency",
        "blank-description",
        "over-long",
        "non-printable",
        "foreign-currency",
      ]);
    })
  );
});

describe("a file that cannot be read", () => {
  it.effect("names an empty file", () =>
    Effect.gen(function* refuseEmptyFile() {
      const failure = yield* refusal("  \n\n");

      expect(Schema.is(BankFileRejected)(failure) && failure.reason).toBe(
        "empty"
      );
    })
  );

  it.effect("names a header that is not the demo header", () =>
    Effect.gen(function* refuseWrongHeader() {
      const failure = yield* refusal(
        "posted,payee,value\n2026-01-12,Demo,4250"
      );

      expect(Schema.is(BankFileRejected)(failure) && failure.reason).toBe(
        "header"
      );
    })
  );

  it.effect("names a header with no rows under it", () =>
    Effect.gen(function* refuseHeaderOnly() {
      const failure = yield* refusal(
        "date,description,amount_minor,currency,reference"
      );

      expect(Schema.is(BankFileRejected)(failure) && failure.reason).toBe(
        "no-rows"
      );
    })
  );
});

describe("finding an account", () => {
  it.effect("lists the demo bank account for the demo profile", () =>
    Effect.gen(function* listDemoTargets() {
      const targets = yield* listImportTargets.handler({
        profileId: demoProfileId,
      });

      expect(targets).toEqual([demoTarget]);
    }).pipe(Effect.provide(demoLedgerLayer))
  );

  it.effect("refuses an account the profile does not hold", () =>
    Effect.gen(function* refuseUnknownAccount() {
      const outcome = yield* importBankFile
        .handler(
          demoRequest(
            "date,description,amount_minor,currency,reference\n2026-01-12,Demo Coffee,4250,EUR,",
            otherAccountId
          )
        )
        .pipe(Effect.result);

      const failure = refusalOf(outcome);

      expect(Predicate.isTagged(failure, "ImportAccountNotFound")).toBe(true);
      expect(
        Schema.is(ImportAccountNotFound)(failure)
          ? failure.accountId
          : undefined
      ).toBe(otherAccountId);
    }).pipe(Effect.provide(demoLedgerLayer))
  );
});
