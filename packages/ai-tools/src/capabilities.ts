import {
  BankLineFilterSchema,
  BankLineService,
  BankLineStore,
  CategoryChangeSchema,
  NoteChangeSchema,
  UnknownBankLine,
  UnknownCategory,
  readScopeOf,
  writeScopeOf,
} from "@pecunia/bank-lines";
import type { BankLineId, CategoryId, ProfileId } from "@pecunia/bank-lines";
import { implement } from "@pecunia/capability/implement";
import { Clock, Effect, Option, Schema } from "effect";

import { ToolCaller } from "./caller.js";
import { CategoryStore } from "./category-store.js";
import {
  confirmCategoryContract,
  getLineContract,
  listCategoriesContract,
  listLinesContract,
  listReportsContract,
  suggestCategoryContract,
} from "./contracts.js";
import { occurredRangeOf } from "./day.js";
import { cursorTextOf } from "./model.js";
import { categoriesByName, reportsByNewest, take } from "./order.js";
import { TimestampMillisSchema } from "./primitives.js";
import { ToolRefused } from "./refusal.js";
import { ReportStore } from "./report-store.js";
import { SuggestionStore } from "./suggestion-store.js";

const unknownBankLine = (profileId: ProfileId, lineId: BankLineId) =>
  new UnknownBankLine({
    lineId,
    message: `Bank line ${lineId} is not in profile ${profileId}`,
    profileId,
    repair: "Call `get_line` with a line id the acting profile owns.",
  });

const unknownCategory = (profileId: ProfileId, categoryId: CategoryId) =>
  new UnknownCategory({
    categoryId,
    message: `Category ${categoryId} is not in profile ${profileId}`,
    profileId,
    repair: "Call `list_categories` for a category id the acting profile owns.",
  });

export const listCategories = implement(listCategoriesContract, ({ limit }) =>
  Effect.gen(function* listProfileCategories() {
    const caller = yield* ToolCaller;
    const scope = yield* readScopeOf(caller.person, caller.profileId);
    const store = yield* CategoryStore;
    const categories = yield* store.list(scope.profileId);

    return { categories: take(categoriesByName(categories), limit) };
  })
);

export const listLines = implement(
  listLinesContract,
  ({ categoryId, cursor, from, limit, text, to }) =>
    Effect.gen(function* listProfileLines() {
      const caller = yield* ToolCaller;
      const scope = yield* readScopeOf(caller.person, caller.profileId);
      const service = yield* BankLineService;

      const occurred = occurredRangeOf(
        Option.fromUndefinedOr(from),
        Option.fromUndefinedOr(to)
      );

      if (Option.isNone(occurred)) {
        return yield* new ToolRefused({
          field: "from",
          message: `from ${from} is later than to ${to}`,
          reason: "invalidField",
        });
      }

      const page = yield* service.list(scope, {
        cursor: Option.fromUndefinedOr(cursor),
        filter: {
          account: Option.none(),
          amount: Option.none(),
          category:
            categoryId === undefined
              ? BankLineFilterSchema.fields.category.cases.Any.make({})
              : BankLineFilterSchema.fields.category.cases.Of.make({
                  categoryId,
                }),
          direction: Option.none(),
          occurred,
          review: BankLineFilterSchema.fields.review.cases.Any.make({}),
        },
        limit,
        search: text ?? "",
      });

      return {
        lines: page.lines,
        nextCursor: Option.match(page.next, {
          onNone: () => null,
          onSome: cursorTextOf,
        }),
        total: page.total,
      };
    })
);

export const getLine = implement(getLineContract, ({ lineId }) =>
  Effect.gen(function* readProfileLine() {
    const caller = yield* ToolCaller;
    const scope = yield* readScopeOf(caller.person, caller.profileId);
    const store = yield* BankLineStore;
    const lines = yield* store.lines(scope.profileId);
    const line = lines.find((candidate) => candidate.id === lineId);

    if (line === undefined) {
      return yield* unknownBankLine(scope.profileId, lineId);
    }

    return { line };
  })
);

export const suggestCategory = implement(
  suggestCategoryContract,
  ({ categoryId, lineId }) =>
    Effect.gen(function* suggestProfileCategory() {
      const caller = yield* ToolCaller;
      const scope = yield* writeScopeOf(caller.person, caller.profileId);
      const store = yield* BankLineStore;
      const lines = yield* store.lines(scope.profileId);
      const line = lines.find((candidate) => candidate.id === lineId);

      if (line === undefined) {
        return yield* unknownBankLine(scope.profileId, lineId);
      }

      if (Option.isSome(line.category)) {
        return yield* new ToolRefused({
          field: "lineId",
          message: `Bank line ${lineId} already carries a person-confirmed category`,
          reason: "alreadyConfirmed",
        });
      }

      const categories = yield* store.categories(scope.profileId);

      if (!categories.includes(categoryId)) {
        return yield* unknownCategory(scope.profileId, categoryId);
      }

      const clockMillis = yield* Clock.currentTimeMillis;

      const suggestedAt = yield* Schema.decodeEffect(TimestampMillisSchema)(
        clockMillis
      ).pipe(Effect.orDie);

      const suggestion = {
        categoryId,
        lineId,
        profileId: scope.profileId,
        suggestedAt,
      };

      const suggestions = yield* SuggestionStore;

      yield* suggestions.record(suggestion);

      return { suggestion };
    })
);

export const confirmCategory = implement(
  confirmCategoryContract,
  ({ categoryId, lineId }) =>
    Effect.gen(function* confirmProfileCategory() {
      const caller = yield* ToolCaller;
      const scope = yield* writeScopeOf(caller.person, caller.profileId);
      const service = yield* BankLineService;

      const line = yield* service.edit(scope, {
        category: CategoryChangeSchema.cases.Assigned.make({ categoryId }),
        lineId,
        note: NoteChangeSchema.cases.Unchanged.make({}),
      });

      return { line };
    })
);

export const listReports = implement(listReportsContract, ({ limit }) =>
  Effect.gen(function* listProfileReports() {
    const caller = yield* ToolCaller;
    const scope = yield* readScopeOf(caller.person, caller.profileId);
    const store = yield* ReportStore;
    const reports = yield* store.list(scope.profileId);

    return { reports: take(reportsByNewest(reports), limit) };
  })
);

export const aiToolCapabilities = [
  listCategories,
  listLines,
  getLine,
  suggestCategory,
  confirmCategory,
  listReports,
] as const;
