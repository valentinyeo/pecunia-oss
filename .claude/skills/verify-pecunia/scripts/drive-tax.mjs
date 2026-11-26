#!/usr/bin/env node
import { Effect, Layer, Ref, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import { CurrentPerson } from "../../../../packages/access/dist/index.js";
import {
  listTaxDues,
  syncTaxDues,
} from "../../../../packages/tax/dist/capabilities.js";
import {
  demoFreeAgentDues,
  demoPerson,
  demoProfileId,
  demoTaxProfile,
} from "../../../../packages/tax/dist/demo.js";
import { parseFreeAgentAnswer } from "../../../../packages/tax/dist/freeagent.js";
import { memoryTaxDueStoreLayer } from "../../../../packages/tax/dist/memory.js";
import {
  TaxObligationSchema,
  TaxObligationStatusSchema,
} from "../../../../packages/tax/dist/model.js";
import { TaxDueService } from "../../../../packages/tax/dist/service.js";
import { TaxDueStore } from "../../../../packages/tax/dist/store.js";
import { TaxBooks } from "../../../../packages/tax/dist/tax-books.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { observe } from "./lib/observation.mjs";

const vat = Schema.decodeSync(TaxObligationSchema)({
  amount: { currency: "EUR", minor: 312_500 },
  dueOn: "2025-11-07",
  id: "0192f0c1-0044-7a1b-9c2d-3e4f5a6b7c8d",
  kind: "vat",
  label: "Demo VAT",
  periodEndsOn: "2025-09-30",
  profileId: demoProfileId,
  status: TaxObligationStatusSchema.cases.Estimated.make({
    booksStatus: "unpaid",
  }),
  syncedAt: "2026-01-01T00:00:00.000Z",
  taxProfileId: demoTaxProfile.id,
});

const recorder = mutationRecorder();

const store = countingLayer({
  layer: memoryTaxDueStoreLayer({ dues: [vat], taxProfiles: [demoTaxProfile] }),
  mutations: ["replace"],
  recorder,
  service: TaxDueStore,
});

const request = { profileId: demoProfileId, taxProfileId: demoTaxProfile.id };

const receiptText = (receipt) =>
  `inserted=${receipt.inserted} removed=${receipt.removed} unchanged=${receipt.unchanged} updated=${receipt.updated}`;

const duesText = (page) =>
  page.dues
    .map(
      (due) =>
        `${due.kind}:${due.dueOn}:${due.amount.currency}:${due.amount.minor}:${due.status._tag}`
    )
    .join(",");

const observations = await Effect.runPromise(
  Effect.gen(function* driveTax() {
    const payload = yield* Ref.make(demoFreeAgentDues);

    const books = Layer.succeed(TaxBooks, {
      booksTool: "freeagent",
      fetchDues: () =>
        Ref.get(payload).pipe(
          Effect.flatMap((value) =>
            Effect.fromResult(parseFreeAgentAnswer(value))
          )
        ),
    });

    const world = Layer.mergeAll(
      TaxDueService.layer.pipe(Layer.provide(Layer.merge(store, books))),
      Layer.succeed(CurrentPerson, demoPerson)
    ).pipe(Layer.provide(SecureRandom.layerWebCrypto));

    return yield* Effect.gen(function* syncAndReadBack() {
      const before = yield* listTaxDues.handler({ profileId: demoProfileId });

      const first = yield* syncTaxDues.handler(request);

      const stored = yield* listTaxDues.handler({ profileId: demoProfileId });

      yield* Ref.set(payload, {
        self_assessment_payments: [
          demoFreeAgentDues.self_assessment_payments[0],
        ],
      });

      const second = yield* syncTaxDues.handler(request);

      const afterRemoval = yield* listTaxDues.handler({
        profileId: demoProfileId,
      });

      const replay = yield* syncTaxDues.handler(request);

      const afterReplay = yield* listTaxDues.handler({
        profileId: demoProfileId,
      });

      return [
        observe({
          id: "tax-capability-lists-dues",
          value: `year=${before.taxProfiles[0].jurisdiction} ${before.taxProfiles[0].yearStart.month}-${before.taxProfiles[0].yearStart.day} ${duesText(before)}`,
        }),
        observe({
          id: "tax-capability-syncs-recorded-books",
          value: receiptText(first),
        }),
        observe({
          id: "tax-sync-reads-back",
          operation: "listTaxDues",
          value: duesText(stored),
        }),
        observe({
          id: "tax-sync-removes-missing-payment",
          value: receiptText(second),
        }),
        observe({
          id: "tax-removal-reads-back",
          operation: "listTaxDues",
          value: duesText(afterRemoval),
        }),
        observe({
          id: "tax-sync-replay-is-unchanged",
          value: receiptText(replay),
        }),
        observe({
          id: "tax-replay-reads-back",
          operation: "listTaxDues",
          value: duesText(afterReplay),
        }),
      ];
    }).pipe(Effect.provide(world));
  })
);

process.stdout.write(
  `${JSON.stringify({ observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
