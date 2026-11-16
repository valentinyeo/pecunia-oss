import {
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
} from "effect";

import type { BankLineStoreError } from "./bank-line-store-error.js";
import { ReviewSchema, TimestampMillisSchema } from "./model.js";
import type {
  BankLine,
  BankLinePage,
  BankLineQuery,
  CategoryChange,
  CategoryId,
  LineEdit,
  LineReview,
  NoteChange,
} from "./model.js";
import { selectBankLines } from "./query.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { BankLineStore } from "./store.js";
import { UnknownBankLine } from "./unknown-bank-line.js";
import { UnknownCategory } from "./unknown-category.js";

const findLine = (
  lines: readonly BankLine[],
  lineId: BankLine["id"],
  scope: WriteScope
) => {
  const line = lines.find((candidate) => candidate.id === lineId);

  return line === undefined
    ? Effect.fail(
        new UnknownBankLine({
          lineId,
          message: `Bank line ${lineId} is not in profile ${scope.profileId}.`,
          profileId: scope.profileId,
          repair:
            "Pick a line id returned by `listBankLines` for this profile.",
        })
      )
    : Effect.succeed(line);
};

const withCategory = (
  line: BankLine,
  change: CategoryChange,
  categories: readonly CategoryId[],
  scope: WriteScope
) =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => Effect.succeed(line)),
    Match.tag("Cleared", () =>
      Effect.succeed({ ...line, category: Option.none() })
    ),
    Match.tag("Assigned", ({ categoryId }) =>
      categories.includes(categoryId)
        ? Effect.succeed({ ...line, category: Option.some(categoryId) })
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
    Match.exhaustive
  );

const withNote = (line: BankLine, change: NoteChange) =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => line),
    Match.tag("Set", ({ text }) => ({ ...line, note: text.trim() })),
    Match.exhaustive
  );

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
    ) => Effect.Effect<BankLinePage, BankLineStoreError>;
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

      return selectBankLines(lines, { ...query, profileId: scope.profileId });
    });

    const edit = Effect.fn("BankLineService.edit")(function* edit(
      scope: WriteScope,
      line: LineEdit
    ) {
      const lines = yield* store.lines(scope.profileId);

      const found = yield* findLine(lines, line.lineId, scope);

      const categories = yield* store.categories(scope.profileId);

      const categorized = yield* withCategory(
        found,
        line.category,
        categories,
        scope
      );

      return yield* store.save(withNote(categorized, line.note));
    });

    const review = Effect.fn("BankLineService.review")(function* review(
      scope: WriteScope,
      request: LineReview
    ) {
      const lines = yield* store.lines(scope.profileId);

      const found = yield* findLine(lines, request.lineId, scope);

      const alreadyReviewed = Match.value(found.review).pipe(
        Match.tag("Reviewed", () => true),
        Match.tag("Awaiting", () => false),
        Match.exhaustive
      );

      if (alreadyReviewed) {
        return found;
      }

      const at = yield* Schema.decodeEffect(TimestampMillisSchema)(
        DateTime.toEpochMillis(yield* DateTime.now)
      ).pipe(Effect.orDie);

      return yield* store.save({
        ...found,
        review: ReviewSchema.cases.Reviewed.make({ at }),
      });
    });

    return { edit, list, review } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
