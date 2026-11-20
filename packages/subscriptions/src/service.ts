import { Context, DateTime, Effect, Layer, Match, Schema } from "effect";

import type { BaseCurrencyMismatch } from "./base-currency-mismatch.js";
import { pageOf, viewOf } from "./cost.js";
import { detectRepeatPayments } from "./detect.js";
import type { IllegalStatusChange } from "./illegal-status-change.js";
import { TimestampMillisSchema } from "./model.js";
import type {
  CategoryId,
  Frequency,
  PayeeId,
  ProfileId,
  RepeatPaymentPage,
  SubscriptionCategoryChange,
  SubscriptionId,
  SubscriptionPage,
  SubscriptionEntry,
  SubscriptionQuery,
  SubscriptionView,
  StatusChange,
} from "./model.js";
import { NoRepeatPaymentFound } from "./no-repeat-payment-found.js";
import { nextChargeOn } from "./schedule.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { statusWith } from "./status.js";
import { SubscriptionStore } from "./store.js";
import type { SubscriptionCostOverflow } from "./subscription-cost-overflow.js";
import type { SubscriptionStoreError } from "./subscription-store-error.js";
import { UnknownCategory } from "./unknown-category.js";
import { UnknownSubscription } from "./unknown-subscription.js";

export interface StatusRequest {
  readonly change: StatusChange;
  readonly subscriptionId: SubscriptionId;
}

export interface CategoryRequest {
  readonly category: SubscriptionCategoryChange;
  readonly subscriptionId: SubscriptionId;
}

export interface RepeatMarkRequest {
  readonly frequency: Frequency;
  readonly payeeId: PayeeId;
}

const unknownSubscription = (
  scope: WriteScope,
  subscriptionId: SubscriptionId
) =>
  new UnknownSubscription({
    message: `Repeat payment ${subscriptionId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "Read the list again and send the change for a repeat payment the profile holds.",
    subscriptionId,
  });

const checkCategory = (
  change: SubscriptionCategoryChange,
  categories: readonly CategoryId[],
  scope: WriteScope
) =>
  Match.value(change).pipe(
    Match.tag("Assign", ({ categoryId }) =>
      categories.includes(categoryId)
        ? Effect.void
        : Effect.fail(
            new UnknownCategory({
              categoryId,
              message: `Category ${categoryId} is not a live category of profile ${scope.profileId}.`,
              profileId: scope.profileId,
              repair:
                "Assign a category id the profile owns, or clear the category.",
            })
          )
    ),
    Match.tag("Clear", () => Effect.void),
    Match.exhaustive
  );

export class SubscriptionService extends Context.Service<
  SubscriptionService,
  {
    readonly changeStatus: (
      scope: WriteScope,
      request: StatusRequest
    ) => Effect.Effect<
      SubscriptionView,
      | BaseCurrencyMismatch
      | IllegalStatusChange
      | SubscriptionCostOverflow
      | SubscriptionStoreError
      | UnknownSubscription
    >;
    readonly find: (
      scope: ReadScope
    ) => Effect.Effect<RepeatPaymentPage, SubscriptionStoreError>;
    readonly list: (
      scope: ReadScope,
      query: SubscriptionQuery
    ) => Effect.Effect<
      SubscriptionPage,
      BaseCurrencyMismatch | SubscriptionCostOverflow | SubscriptionStoreError
    >;
    readonly mark: (
      scope: WriteScope,
      request: RepeatMarkRequest
    ) => Effect.Effect<
      SubscriptionView,
      | BaseCurrencyMismatch
      | NoRepeatPaymentFound
      | SubscriptionCostOverflow
      | SubscriptionStoreError
    >;
    readonly setCategory: (
      scope: WriteScope,
      request: CategoryRequest
    ) => Effect.Effect<
      SubscriptionView,
      | BaseCurrencyMismatch
      | SubscriptionCostOverflow
      | SubscriptionStoreError
      | UnknownCategory
      | UnknownSubscription
    >;
  }
>()("@pecunia/subscriptions/SubscriptionService", {
  make: Effect.gen(function* makeSubscriptionService() {
    const store = yield* SubscriptionStore;

    const nowMillis = Effect.fn("SubscriptionService.nowMillis")(
      function* nowMillis() {
        return yield* Schema.decodeEffect(TimestampMillisSchema)(
          DateTime.toEpochMillis(yield* DateTime.now)
        ).pipe(Effect.orDie);
      }
    );

    const viewIn = (profileId: ProfileId, entry: SubscriptionEntry) =>
      Effect.gen(function* viewRepeatPayment() {
        const baseCurrency = yield* store.baseCurrency(profileId);

        return yield* Effect.fromResult(viewOf(entry, baseCurrency));
      });

    const list = Effect.fn("SubscriptionService.list")(function* list(
      scope: ReadScope,
      query: SubscriptionQuery
    ) {
      const entries = yield* store.entries(scope.profileId);
      const baseCurrency = yield* store.baseCurrency(scope.profileId);

      return yield* Effect.fromResult(
        pageOf(entries, query.filter, baseCurrency)
      );
    });

    const find = Effect.fn("SubscriptionService.find")(function* find(
      scope: ReadScope
    ) {
      const charges = yield* store.charges(scope.profileId);
      const payees = yield* store.payees(scope.profileId);

      return { payments: detectRepeatPayments(charges, payees) };
    });

    const mark = Effect.fn("SubscriptionService.mark")(function* mark(
      scope: WriteScope,
      request: RepeatMarkRequest
    ) {
      const at = yield* nowMillis();
      const charges = yield* store.charges(scope.profileId);
      const payees = yield* store.payees(scope.profileId);

      const found = detectRepeatPayments(charges, payees).find(
        (payment) => payment.payeeId === request.payeeId
      );

      if (found === undefined) {
        return yield* new NoRepeatPaymentFound({
          message: `Profile ${scope.profileId} has no repeat payment for payee ${request.payeeId} in its outgoing payment history.`,
          payeeId: request.payeeId,
          profileId: scope.profileId,
          repair:
            "Sync the account that pays the merchant, then call `findRepeatPayments` for the profile.",
        });
      }

      const entry = yield* store.mark(scope.profileId, {
        amount: found.typicalAmount,
        baseAmount: found.typicalBaseAmount,
        confidence: found.confidence,
        frequency: request.frequency,
        lastChargedOn: found.lastChargedOn,
        nextExpectedOn: nextChargeOn(found.lastChargedOn, request.frequency),
        occurrenceCount: found.occurrenceCount,
        payeeId: found.payeeId,
        status: statusWith("Confirmed", at),
      });

      return yield* viewIn(scope.profileId, entry);
    });

    const changeStatus = Effect.fn("SubscriptionService.changeStatus")(
      function* changeStatus(scope: WriteScope, request: StatusRequest) {
        const at = yield* nowMillis();

        const patched = yield* store.patchStatus(
          scope.profileId,
          request.subscriptionId,
          request.change,
          at
        );

        const entry = yield* Effect.fromOption(patched, () =>
          unknownSubscription(scope, request.subscriptionId)
        );

        return yield* viewIn(scope.profileId, entry);
      }
    );

    const setCategory = Effect.fn("SubscriptionService.setCategory")(
      function* setCategory(scope: WriteScope, request: CategoryRequest) {
        const categories = yield* store.categories(scope.profileId);

        yield* checkCategory(request.category, categories, scope);

        const patched = yield* store.categorise(
          scope.profileId,
          request.subscriptionId,
          request.category
        );

        const entry = yield* Effect.fromOption(patched, () =>
          unknownSubscription(scope, request.subscriptionId)
        );

        return yield* viewIn(scope.profileId, entry);
      }
    );

    return { changeStatus, find, list, mark, setCategory } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
