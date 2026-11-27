import { describe, expect, it } from "@effect/vitest";
import { ProviderAccountIdSchema } from "@pecunia/core/bank-import";
import { ProfileIdSchema } from "@pecunia/core/settings";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Schema } from "effect";
import { Digest, WebCrypto } from "effect/crypto";

import { d1ImportLedgerLayer } from "../src/d1.js";
import { ImportLedger } from "../src/import-ledger.js";
import { runImportMachine } from "../src/import-machine.js";

const EXAMPLE_LTD_ID = "0192f0c1-0001-702d-8484-48490b729601";

const DEMO_BANK_ID = "0192f0c1-0006-7b7b-8ffd-ffde623dd8df";

const liveImportLayer = () =>
  Layer.mergeAll(
    d1ImportLedgerLayer.pipe(Layer.provide(openDemoSqliteLayer())),
    Digest.layerWebCrypto.pipe(
      Layer.provide(WebCrypto.layer(globalThis.crypto))
    )
  );

describe("@pecunia/bank-import/d1", () => {
  it.effect(
    "lists bank import targets and records CSV rows idempotently into D1 transactions",
    () =>
      Effect.gen(function* testCsvImport() {
        const profileId =
          yield* Schema.decodeEffect(ProfileIdSchema)(EXAMPLE_LTD_ID);

        const accountId = yield* Schema.decodeEffect(ProviderAccountIdSchema)(
          DEMO_BANK_ID
        );

        const ledger = yield* ImportLedger;

        const targets = yield* ledger.listTargets(profileId);

        expect(targets.some((target) => target.label === "Demo Bank")).toBe(
          true
        );

        const csv = [
          "date,description,amount_minor,currency,reference",
          "2025-11-18,Demo Stationery,-1950,EUR,INV-101",
          "2025-11-20,Demo Workshop Refund,5000,EUR,REF-202",
          "2025-11-21,Bad Currency Line,-100,USD,BAD-FX",
        ].join("\n");

        const first = yield* runImportMachine({
          accountId,
          content: csv,
          fileName: "demo-statement.csv",
          profileId,
        });

        expect(first.imported).toBe(2);
        expect(first.alreadyImported).toBe(0);
        expect(first.rejected).toHaveLength(1);
        expect(first.rejected[0]?.reason).toBe("foreign-currency");

        const second = yield* runImportMachine({
          accountId,
          content: csv,
          fileName: "demo-statement.csv",
          profileId,
        });

        expect(second.imported).toBe(0);
        expect(second.alreadyImported).toBe(2);

        const stored = yield* ledger.storedLines(profileId, accountId);

        expect(stored).toHaveLength(2);
        expect(stored[0]?.amountMinor).toBe(-1950);
        expect(stored[1]?.amountMinor).toBe(5000);
      }).pipe(Effect.provide(liveImportLayer()))
  );
});
