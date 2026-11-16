import { Effect, Match, Option, Predicate } from "effect";

import { CursorFilterMismatch } from "./cursor-filter-mismatch.js";
import type {
  AmountRange,
  BankLine,
  BankLineCursor,
  BankLineFilter,
  BankLinePage,
  CursorFingerprint,
  ListBankLinesRequest,
  OccurredRange,
  Position,
} from "./model.js";

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

export const comparePositions = (left: Position, right: Position): number => {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt > right.occurredAt ? -1 : 1;
  }

  return compareText(left.id, right.id);
};

const withinAmount = (amount: AmountRange, line: BankLine) =>
  line.amount.currency === amount.currency &&
  line.amount.minor >= amount.min &&
  line.amount.minor <= amount.max;

const withinOccurred = (occurred: OccurredRange, line: BankLine) =>
  line.occurredAt >= occurred.from && line.occurredAt <= occurred.to;

const matchesAmount = (amount: Option.Option<AmountRange>, line: BankLine) =>
  Option.match(amount, {
    onNone: () => true,
    onSome: (range) => withinAmount(range, line),
  });

const matchesOccurred = (
  occurred: Option.Option<OccurredRange>,
  line: BankLine
) =>
  Option.match(occurred, {
    onNone: () => true,
    onSome: (range) => withinOccurred(range, line),
  });

const matchesAccount = (
  account: Option.Option<BankLine["accountId"]>,
  line: BankLine
) =>
  Option.match(account, {
    onNone: () => true,
    onSome: (accountId) => line.accountId === accountId,
  });

const matchesDirection = (
  direction: Option.Option<BankLine["direction"]>,
  line: BankLine
) =>
  Option.match(direction, {
    onNone: () => true,
    onSome: (value) => line.direction === value,
  });

const matchesCategory = (filter: BankLineFilter["category"], line: BankLine) =>
  Match.value(filter).pipe(
    Match.tag("Any", () => true),
    Match.tag("Uncategorised", () => Option.isNone(line.category)),
    Match.tag("Of", (chosen) =>
      Option.exists(
        line.category,
        (categoryId) => categoryId === chosen.categoryId
      )
    ),
    Match.exhaustive
  );

const matchesReview = (filter: BankLineFilter["review"], line: BankLine) =>
  Match.value(filter).pipe(
    Match.tag("Any", () => true),
    Match.tag("Awaiting", () => Predicate.isTagged(line.review, "Awaiting")),
    Match.tag("Reviewed", () => Predicate.isTagged(line.review, "Reviewed")),
    Match.exhaustive
  );

export const matchesFilter = (filter: BankLineFilter, line: BankLine) =>
  matchesAccount(filter.account, line) &&
  matchesAmount(filter.amount, line) &&
  matchesCategory(filter.category, line) &&
  matchesDirection(filter.direction, line) &&
  matchesOccurred(filter.occurred, line) &&
  matchesReview(filter.review, line);

export const searchableText = (line: BankLine): readonly string[] => [
  line.raw.description,
  line.raw.merchant,
  line.raw.reference,
  line.note,
];

export const matchesSearch = (search: string, line: BankLine) => {
  const needle = search.trim().toLowerCase();

  return (
    needle === "" ||
    searchableText(line).some((text) => text.toLowerCase().includes(needle))
  );
};

export const orderBankLines = (
  lines: readonly BankLine[]
): readonly BankLine[] => lines.toSorted(comparePositions);

const positionOf = (
  line: BankLine,
  fingerprint: CursorFingerprint
): BankLineCursor => ({
  fingerprint,
  id: line.id,
  occurredAt: line.occurredAt,
});

const afterCursor = (cursor: Option.Option<BankLineCursor>, line: BankLine) =>
  Option.match(cursor, {
    onNone: () => true,
    onSome: (value) => comparePositions(line, value) > 0,
  });

const amountKey = (amount: Option.Option<AmountRange>) =>
  Option.match(amount, {
    onNone: () => "*",
    onSome: (range) => `${range.currency}:${range.min}:${range.max}`,
  });

const occurredKey = (occurred: Option.Option<OccurredRange>) =>
  Option.match(occurred, {
    onNone: () => "*",
    onSome: (range) => `${range.from}:${range.to}`,
  });

const categoryKey = (category: BankLineFilter["category"]) =>
  Match.value(category).pipe(
    Match.tag("Any", () => "*"),
    Match.tag("Uncategorised", () => "none"),
    Match.tag("Of", (chosen) => String(chosen.categoryId)),
    Match.exhaustive
  );

const reviewKey = (review: BankLineFilter["review"]) =>
  Match.value(review).pipe(
    Match.tag("Any", () => "*"),
    Match.tag("Awaiting", () => "awaiting"),
    Match.tag("Reviewed", () => "reviewed"),
    Match.exhaustive
  );

const filterText = (
  profileId: ListBankLinesRequest["profileId"],
  filter: BankLineFilter,
  search: string
) =>
  [
    `profile=${profileId}`,
    `account=${Option.getOrElse(filter.account, () => "*")}`,
    `amount=${amountKey(filter.amount)}`,
    `category=${categoryKey(filter.category)}`,
    `direction=${Option.getOrElse(filter.direction, () => "*")}`,
    `occurred=${occurredKey(filter.occurred)}`,
    `review=${reviewKey(filter.review)}`,
    `search=${search.trim().toLowerCase()}`,
  ].join("&");

const FINGERPRINT_MODULUS = 2_176_782_189;

const foldText = (text: string) => {
  let hash = 5381;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33 + (text.codePointAt(index) ?? 0)) % FINGERPRINT_MODULUS;
  }

  return hash;
};

export const filterFingerprint = (
  profileId: ListBankLinesRequest["profileId"],
  filter: BankLineFilter,
  search: string
): CursorFingerprint =>
  foldText(filterText(profileId, filter, search)).toString(36);

export const selectBankLines = (
  lines: readonly BankLine[],
  request: ListBankLinesRequest
): Effect.Effect<BankLinePage, CursorFilterMismatch> =>
  Effect.gen(function* selectBankLinesForRequest() {
    const fingerprint = filterFingerprint(
      request.profileId,
      request.filter,
      request.search
    );

    const { cursor } = request;

    if (Option.isSome(cursor) && cursor.value.fingerprint !== fingerprint) {
      return yield* new CursorFilterMismatch({
        cursorFingerprint: cursor.value.fingerprint,
        filterFingerprint: fingerprint,
        message:
          "This cursor was made under a different profile, filter or search, so it does not name a position in this list.",
        repair:
          "Drop the cursor when you change the profile, the filter or the search, and start the new list from its first page.",
      });
    }

    const ordered = orderBankLines(
      lines.filter(
        (line) =>
          line.profileId === request.profileId &&
          matchesFilter(request.filter, line) &&
          matchesSearch(request.search, line)
      )
    );

    const remaining = ordered.filter((line) => afterCursor(cursor, line));

    const page = remaining.slice(0, request.limit);

    const last = page.at(-1);

    const hasMore = last !== undefined && remaining.length > page.length;

    return {
      lines: page,
      next: hasMore
        ? Option.some(positionOf(last, fingerprint))
        : Option.none(),
      total: ordered.length,
    };
  });
