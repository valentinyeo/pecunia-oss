import { expect, it } from "@effect/vitest";
import { Effect, Predicate, Ref } from "effect";

import { listTaxDues, syncTaxDues } from "../src/capabilities.js";
import {
  demoFreeAgentDues,
  demoProfileId,
  demoTaxProfile,
} from "../src/demo.js";
import { TaxBooksUnavailable } from "../src/tax-books-unavailable.js";
import type { TaxBooksService } from "../src/tax-books.js";
import {
  layerFor,
  otherDue,
  otherTaxProfile,
  owner,
  scriptedBooks,
  stranger,
  viewer,
} from "./support.js";

const list = (profileId: typeof demoProfileId) =>
  listTaxDues.handler({ profileId });

const sync = (taxProfileId: typeof demoTaxProfile.id) =>
  syncTaxDues.handler({ profileId: demoProfileId, taxProfileId });

const unavailableBooks: TaxBooksService = {
  booksTool: "freeagent",
  fetchDues: () =>
    Effect.fail(
      new TaxBooksUnavailable({
        booksTool: "freeagent",
        message: "FreeAgent refused the request with 503.",
        repair: "Retry `syncTaxDues` once FreeAgent answers again.",
      })
    ),
};

const payloadOf = (...payments: readonly unknown[]) => ({
  self_assessment_payments: payments,
});

const demoPayments = demoFreeAgentDues.self_assessment_payments;

const withPayload = <A, E, R>(
  body: (payload: Ref.Ref<unknown>) => Effect.Effect<A, E, R>,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a recorded books-tool answer is untrusted; the scripted adapter parses it at the boundary.
  start: unknown
) =>
  Effect.gen(function* runWithPayload() {
    const payload = yield* Ref.make<unknown>(start);

    return yield* body(payload).pipe(
      Effect.provide(layerFor(owner, scriptedBooks(Ref.get(payload))))
    );
  });

it.effect("removes a Self Assessment payment that disappeared upstream", () =>
  withPayload(
    (payload) =>
      Effect.gen(function* removeDisappearedPayment() {
        const first = yield* sync(demoTaxProfile.id);

        expect(first).toEqual({
          inserted: 2,
          removed: 0,
          unchanged: 0,
          updated: 0,
        });

        yield* Ref.set(payload, payloadOf(demoPayments[0]));

        const second = yield* sync(demoTaxProfile.id);

        expect(second).toEqual({
          inserted: 0,
          removed: 1,
          unchanged: 1,
          updated: 0,
        });

        const stored = yield* list(demoProfileId);

        expect(stored.dues.map((due) => due.dueOn)).toEqual(["2026-01-31"]);
      }),
    demoFreeAgentDues
  )
);

it.effect("updates a changed amount in place and keeps its row id", () =>
  withPayload(
    (payload) =>
      Effect.gen(function* updateChangedAmount() {
        yield* sync(demoTaxProfile.id);

        const before = yield* list(demoProfileId);

        yield* Ref.set(
          payload,
          payloadOf(
            {
              ...demoPayments[0],
              amount_due: "1300.00",
            },
            demoPayments[1]
          )
        );

        const receipt = yield* sync(demoTaxProfile.id);

        expect(receipt).toEqual({
          inserted: 0,
          removed: 0,
          unchanged: 1,
          updated: 1,
        });

        const after = yield* list(demoProfileId);

        expect(after.dues[0]?.id).toBe(before.dues[0]?.id);
        expect(after.dues[0]?.amount).toEqual({
          currency: "GBP",
          minor: 130_000,
        });
      }),
    demoFreeAgentDues
  )
);

it.effect(
  "leaves every stored due alone when the books tool answers badly",
  () =>
    withPayload(
      (payload) =>
        Effect.gen(function* keepDuesOnBadAnswer() {
          yield* sync(demoTaxProfile.id);

          yield* Ref.set(payload, { self_assessment_payments: "not a list" });

          const failed = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

          expect(failed._tag).toBe("TaxDuesRejected");

          const stored = yield* list(demoProfileId);

          expect(stored.dues).toHaveLength(2);
        }),
      demoFreeAgentDues
    )
);

it.effect("names the fields a bad FreeAgent payload cannot store", () =>
  Effect.gen(function* refuseBadPayload() {
    const commaAmount = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(Predicate.isTagged(commaAmount, "TaxDuesRejected")).toBe(true);

    if (Predicate.isTagged(commaAmount, "TaxDuesRejected")) {
      expect(commaAmount.rejections).toEqual([
        { field: "amount_due", index: 0, reason: "NotADecimal" },
      ]);
    }
  }).pipe(
    Effect.provide(
      layerFor(
        owner,
        scriptedBooks(
          Effect.succeed(
            payloadOf({
              amount_due: "1,240.50",
              currency: "GBP",
              due_on: "2026-01-31",
              period_ends_on: "2025-04-05",
              status: "unpaid",
            })
          )
        )
      )
    )
  )
);

it.effect("refuses a due date before the period it closes", () =>
  Effect.gen(function* refuseBackwardsDates() {
    const failed = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(Predicate.isTagged(failed, "TaxDuesRejected")).toBe(true);

    if (Predicate.isTagged(failed, "TaxDuesRejected")) {
      expect(failed.rejections).toEqual([
        { field: "due_on", index: 0, reason: "DueBeforePeriodEnds" },
      ]);
    }
  }).pipe(
    Effect.provide(
      layerFor(
        owner,
        scriptedBooks(
          Effect.succeed(
            payloadOf({
              amount_due: "100.00",
              currency: "GBP",
              due_on: "2025-01-31",
              period_ends_on: "2025-04-05",
              status: "unpaid",
            })
          )
        )
      )
    )
  )
);

it.effect("refuses the same payment twice in one answer", () =>
  Effect.gen(function* refuseDuplicatePayment() {
    const failed = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(Predicate.isTagged(failed, "TaxDuesRejected")).toBe(true);

    if (Predicate.isTagged(failed, "TaxDuesRejected")) {
      expect(failed.rejections).toEqual([
        { field: "period_ends_on", index: 1, reason: "DuplicateDue" },
      ]);
    }
  }).pipe(
    Effect.provide(
      layerFor(
        owner,
        scriptedBooks(
          Effect.succeed(payloadOf(demoPayments[0], demoPayments[0]))
        )
      )
    )
  )
);

it.effect("fails a sync by name when the books tool is unavailable", () =>
  Effect.gen(function* reportUnavailableBooks() {
    const failed = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(Predicate.isTagged(failed, "TaxBooksUnavailable")).toBe(true);

    const stored = yield* list(demoProfileId);

    expect(stored.dues).toEqual([]);
  }).pipe(Effect.provide(layerFor(owner, unavailableBooks)))
);

const neverAsked: TaxBooksService = {
  booksTool: "freeagent",
  fetchDues: () =>
    Effect.die(
      new Error("The books tool was asked about a foreign tax profile.")
    ),
};

it.effect(
  "refuses a tax profile that belongs to another profile before asking the books tool",
  () =>
    Effect.gen(function* refuseForeignTaxProfile() {
      const failed = yield* syncTaxDues
        .handler({
          profileId: demoProfileId,
          taxProfileId: otherTaxProfile.id,
        })
        .pipe(Effect.flip);

      expect(Predicate.isTagged(failed, "UnknownTaxProfile")).toBe(true);
    }).pipe(Effect.provide(layerFor(owner, neverAsked)))
);

it.effect("keeps another profile's dues out of this profile's list", () =>
  Effect.gen(function* scopeByProfile() {
    const mine = yield* list(demoProfileId);

    const theirs = yield* listTaxDues.handler({
      profileId: otherDue.profileId,
    });

    expect(mine.dues).toEqual([]);
    expect(theirs.dues.map((due) => due.id)).toEqual([otherDue.id]);
  }).pipe(Effect.provide(layerFor(owner, scriptedBooks(Effect.succeed({})))))
);

it.effect("lets a viewer read and stops the same viewer from syncing", () =>
  Effect.gen(function* viewerReads() {
    const stored = yield* list(demoProfileId);

    expect(stored.dues).toEqual([]);

    const denied = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(Predicate.isTagged(denied, "Forbidden")).toBe(true);
  }).pipe(Effect.provide(layerFor(viewer, scriptedBooks(Effect.succeed({})))))
);

it.effect("stops a person with no membership in the profile", () =>
  Effect.gen(function* strangerCannotRead() {
    const denied = yield* list(demoProfileId).pipe(Effect.flip);

    expect(Predicate.isTagged(denied, "Forbidden")).toBe(true);

    const refused = yield* sync(demoTaxProfile.id).pipe(Effect.flip);

    expect(refused._tag).toBe("Forbidden");
  }).pipe(Effect.provide(layerFor(stranger, scriptedBooks(Effect.succeed({})))))
);
