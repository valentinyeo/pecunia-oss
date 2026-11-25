#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Effect, Layer, Predicate } from "effect";
import { Digest, WebCrypto } from "effect/crypto";

import {
  importBankFile,
  ImportLedger,
  listImportTargets,
} from "../../../../packages/bank-import/dist/index.js";
import { memoryImportLedgerLayer } from "../../../../packages/bank-import/dist/ledger-memory.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { observe } from "./lib/observation.mjs";

const SCRIPT_DIR = import.meta.dirname;

const REPO_ROOT = path.join(SCRIPT_DIR, "..", "..", "..", "..");

const FIXTURE = path.join(
  REPO_ROOT,
  "packages",
  "bank-import",
  "fixtures",
  "demo-bank.csv"
);

const UNKNOWN_ACCOUNT = "0192f0c1-0008-7000-8000-000000000000";

const BROKEN_FILE = [
  "date,description,amount_minor,currency,reference",
  "2026-03-02,Demo Notebook,-4500,EUR,DEMO-2026-0006",
  "2026-02-30,Demo Notebook,-4500,EUR,DEMO-2026-0007",
].join("\n");

const fence = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

const arguments_ = process.argv.slice(2);

const databaseIndex = arguments_.indexOf("--database");

if (databaseIndex === -1 || arguments_[databaseIndex + 1] === undefined) {
  fence("drive-bank-import needs --database <path to the seeded demo book>");
}

const database = arguments_[databaseIndex + 1];

const book = new DatabaseSync(database, { readOnly: true });

const accounts = book
  .prepare(
    "SELECT a.id, a.profile_id, a.label, a.kind, p.base_currency, pr.label AS provider_label FROM provider_accounts a JOIN profiles p ON p.id = a.profile_id JOIN providers pr ON pr.id = a.provider_id WHERE a.archived_at IS NULL AND a.kind IN ('bank', 'csv') ORDER BY a.label"
  )
  .all();

const targets = accounts.map((account) => ({
  baseCurrency: account.base_currency,
  id: account.id,
  kind: account.kind,
  label: account.label,
  profileId: account.profile_id,
  providerLabel: account.provider_label,
}));

if (targets.length === 0) {
  fence("The demo book holds no bank or CSV account to import into");
}

const [{ profileId }] = targets;

const target = targets.find((entry) => entry.profileId === profileId);

const content = readFileSync(FIXTURE, "utf-8");

const recorder = mutationRecorder();

const layer = Layer.mergeAll(
  countingLayer({
    layer: memoryImportLedgerLayer(targets),
    mutations: ["record"],
    recorder,
    service: ImportLedger,
  }),
  Digest.layerWebCrypto.pipe(Layer.provide(WebCrypto.layer(globalThis.crypto)))
);

const request = (fileContent, accountId, fileName) => ({
  accountId,
  content: fileContent,
  fileName,
  profileId,
});

const observations = await Effect.runPromise(
  Effect.gen(function* driveBankImport() {
    const emitted = [];
    const listed = yield* listImportTargets.handler({ profileId });
    const [first] = listed;
    emitted.push(
      observe({
        id: "import-targets-listed",
        value: `label=${first.label} kind=${first.kind} base=${first.baseCurrency} provider=${first.providerLabel}`,
      })
    );

    const imported = yield* importBankFile.handler(
      request(content, target.id, "demo-bank.csv")
    );

    emitted.push(
      observe({
        id: "import-writes-every-line",
        value: `imported=${imported.imported} alreadyImported=${imported.alreadyImported} rejected=${imported.rejected.length}`,
      })
    );

    const storedFirst = yield* ImportLedger.use((ledger) =>
      ledger.storedLines(profileId, target.id)
    );

    emitted.push(
      observe({
        id: "import-stores-every-line",
        operation: "storedLines",
        value: storedFirst,
      })
    );

    const replayed = yield* importBankFile.handler(
      request(content, target.id, "demo-bank.csv")
    );

    emitted.push(
      observe({
        id: "import-replay-adds-nothing",
        value: `imported=${replayed.imported} alreadyImported=${replayed.alreadyImported}`,
      })
    );

    const storedReplay = yield* ImportLedger.use((ledger) =>
      ledger.storedLines(profileId, target.id)
    );

    emitted.push(
      observe({
        id: "import-replay-stores-nothing",
        operation: "storedLines",
        value: storedReplay,
      })
    );

    const broken = yield* importBankFile.handler(
      request(BROKEN_FILE, target.id, "demo-bank-broken.csv")
    );

    emitted.push(
      observe({
        id: "import-names-a-rejected-line",
        value: `imported=${broken.imported} rejected=${broken.rejected.length} reason=${broken.rejected[0].reason}`,
      })
    );

    const storedBroken = yield* ImportLedger.use((ledger) =>
      ledger.storedLines(profileId, target.id)
    );

    emitted.push(
      observe({
        id: "import-rejected-line-stores-once",
        operation: "storedLines",
        value: storedBroken,
      })
    );

    const unknown = yield* importBankFile
      .handler(request(content, UNKNOWN_ACCOUNT, "demo-bank.csv"))
      .pipe(Effect.result);

    emitted.push(
      observe({
        id: "import-refuses-unknown-account",
        value: Predicate.isTagged(unknown, "Failure")
          ? unknown.failure._tag
          : "Imported",
      })
    );

    const storedUnknown = yield* ImportLedger.use((ledger) =>
      ledger.storedLines(profileId, target.id)
    );

    emitted.push(
      observe({
        id: "import-unknown-account-stores-nothing",
        operation: "storedLines",
        value: storedUnknown,
      })
    );

    return { observations: emitted };
  }).pipe(Effect.provide(layer))
);

process.stdout.write(
  `${JSON.stringify({ ...observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
