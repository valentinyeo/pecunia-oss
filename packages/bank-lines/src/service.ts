import { Context, DateTime, Effect, Layer, Match, Schema } from "effect";
import type { Option } from "effect";

import type { BankLineStoreError } from "./bank-line-store-error.js";
import type { CursorFilterMismatch } from "./cursor-filter-mismatch.js";
import {
  CategoryChangeSchema,
  NoteChangeSchema,
  ReviewChangeSchema,
  TimestampMillisSchema,
} from "./model.js";
import type {
  BankLine,
  BankLineId,
  BankLinePage,
  BankLineQuery,
  CategoryChange,
  CategoryId,
  LineEdit,
  LinePatch,
  LineReview,
  TimestampMillis,
} from "./model.js";
import { selectBankLines } from "./query.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { BankLineStore } from "./store.js";
import { UnknownBankLine } from "./unknown-bank-line.js";
import { UnknownCategory } from "./unknown-category.js";

const untouched = (): LinePatch => ({
  category: CategoryChangeSchema.cases.Unchanged.make({}),
  note: NoteChangeSchema.cases.Unchanged.make({}),
  review: ReviewChangeSchema.cases.Unchanged.make({}),
});

const unknownBankLine = (scope: WriteScope, lineId: BankLineId) =>
  new UnknownBankLine({
    lineId,
    message: `Bank line ${lineId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair: "Pick a line id returned by `listBankLines` for this profile.",
  });

const checkCategory = (
  change: CategoryChange,
  categories: readonly CategoryId[],
  scope: WriteScope
) =>
  Match.value(change).pipe(
    Match.tag("Assigned", ({ categoryId }) =>
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
    Match.tag("Unchanged", () => Effect.void),
    Match.tag("Cleared", () => Effect.void),
    Match.exhaustive
  );

const patchedOrUnknown = (
  patched: Option.Option<BankLine>,
  scope: WriteScope,
  lineId: BankLineId
) => Effect.fromOption(patched, () => unknownBankLine(scope, lineId));

const reviewMark = (at: TimestampMillis) =>
  ReviewChangeSchema.cases.Mark.make({ at });

export class BankLineService extends Context.Service<
  BankLineService,
  {
    readonly edit: (
      scope: WriteScope,
      edit: LineEdit
    ) => Effect.Effect<
      BankLine,
      BankLineStoreError | UnknownBankLine | UnknownCategory
    >;
    readonly list: (
      scope: ReadScope,
      query: BankLineQuery
    ) => Effect.Effect<BankLinePage, BankLineStoreError | CursorFilterMismatch>;
    readonly review: (
      scope: WriteScope,
      review: LineReview
    ) => Effect.Effect<BankLine, BankLineStoreError | UnknownBankLine>;
  }
>()("@pecunia/bank-lines/BankLineService", {
  make: Effect.gen(function* makeBankLineService() {
    const store = yield* BankLineStore;

    const list = Effect.fn("BankLineService.list")(function* list(
      scope: ReadScope,
      query: BankLineQuery
    ) {
      const lines = yield* store.lines(scope.profileId);

      return yield* selectBankLines(lines, {
        ...query,
        profileId: scope.profileId,
      });
    });

    const edit = Effect.fn("BankLineService.edit")(function* edit(
      scope: WriteScope,
      line: LineEdit
    ) {
      const categories = yield* store.categories(scope.profileId);

      yield* checkCategory(line.category, categories, scope);

      const patched = yield* store.patch(scope.profileId, line.lineId, {
        ...untouched(),
        category: line.category,
        note: line.note,
      });

      return yield* patchedOrUnknown(patched, scope, line.lineId);
    });

    const review = Effect.fn("BankLineService.review")(function* review(
      scope: WriteScope,
      request: LineReview
    ) {
      const at = yield* Schema.decodeEffect(TimestampMillisSchema)(
        DateTime.toEpochMillis(yield* DateTime.now)
      ).pipe(Effect.orDie);

      const patched = yield* store.patch(scope.profileId, request.lineId, {
        ...untouched(),
        review: reviewMark(at),
      });

      return yield* patchedOrUnknown(patched, scope, request.lineId);
    });

    return { edit, list, review } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
