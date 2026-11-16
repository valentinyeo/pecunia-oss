import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema, ProfileIdSchema } from "@pecunia/access";
import { Effect, Layer, Match, Option, Predicate, Schema } from "effect";

import { editBankLine, listBankLines } from "../src/capabilities.js";
import { demoCategories, demoPerson, demoProfileId } from "../src/demo.js";
import { memoryBankLineStoreLayer } from "../src/memory.js";
import {
  BankLineSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  CurrencyCodeSchema,
  MinorUnitsSchema,
  NoteChangeSchema,
  ProviderAccountIdSchema,
  ReviewFilterSchema,
  ReviewSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type {
  AmountRange,
  BankLine,
  BankLineCursor,
  BankLinePage,
  BankLineFilter,
  CategoryFilter,
  CategoryId,
  CurrencyCode,
  ListBankLinesRequest,
  OccurredRange,
  ProviderAccountId,
  ReviewFilter,
} from "../src/model.js";
import { BankLineService } from "../src/service.js";

const otherProfileId = Schema.decodeSync(ProfileIdSchema)(
  "profile-other-bound"
);

const seedTimestamp = (value: number) =>
  Schema.decodeSync(TimestampMillisSchema)(value);

const TIMESTAMPS = [
  seedTimestamp(1_736_154_000_000),
  seedTimestamp(1_736_154_000_000),
  seedTimestamp(1_736_154_000_000),
  seedTimestamp(1_738_573_200_000),
  seedTimestamp(1_738_573_200_000),
  seedTimestamp(1_741_683_600_000),
  seedTimestamp(1_750_000_000_000),
] as const;

const tuple = <A>(items: readonly A[]): readonly [A, ...A[]] => {
  const [first, ...rest] = items;

  if (first === undefined) {
    throw new Error("A generated pool needs at least one value");
  }

  return [first, ...rest];
};

const ACCOUNTS: readonly [ProviderAccountId, ...ProviderAccountId[]] = [
  Schema.decodeSync(ProviderAccountIdSchema)("account-demo-a"),
  Schema.decodeSync(ProviderAccountIdSchema)("account-demo-b"),
];

const CURRENCIES: readonly [CurrencyCode, ...CurrencyCode[]] = [
  Schema.decodeSync(CurrencyCodeSchema)("EUR"),
  Schema.decodeSync(CurrencyCodeSchema)("USD"),
  Schema.decodeSync(CurrencyCodeSchema)("GBP"),
  Schema.decodeSync(CurrencyCodeSchema)("JPY"),
];

const WORDS = [
  "Demo",
  "cloud",
  "Coffee",
  "hosting",
  "VAT",
  "Example Ltd",
  "rail",
  "REFUND",
  "zeta",
] as const;

const DIRECTIONS = ["in", "neutral", "out"] as const;

const SEARCH_TEXTS = ["", "...", "zzz-not-a-word", "Demo"] as const;

const STATUSES = ["pending", "posted", "reversed"] as const;

const CATEGORY_IDS: readonly [CategoryId, ...CategoryId[]] = tuple(
  demoCategories.map((entry) => entry.id)
);

const LINE_COUNT = 40;

const PROFILE_CASES = 600;

const NOTE_CASES = 200;

interface Random {
  readonly chance: (probability: number) => boolean;
  readonly int: (min: number, max: number) => number;
  readonly pick: <A>(items: readonly [A, ...A[]]) => A;
}

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const pick = <A>(items: readonly [A, ...A[]]): A => {
    const chosen = items[int(0, items.length - 1)];

    if (chosen === undefined) {
      throw new Error("A generated pick needs a non-empty source list");
    }

    return chosen;
  };

  return { chance: (probability) => next() < probability, int, pick };
};

const units = (value: number) => Schema.decodeSync(MinorUnitsSchema)(value);

const generatedLine = (random: Random, index: number) => ({
  accountId: random.pick(ACCOUNTS),
  amount: {
    currency: random.pick(CURRENCIES),
    minor: units(random.int(-500, 500)),
  },
  baseAmount: { currency: "EUR", minor: units(random.int(-500, 500)) },
  category: random.chance(0.5) ? random.pick(CATEGORY_IDS) : null,
  direction: random.pick(DIRECTIONS),
  id: `line-${index}`,
  note: random.chance(0.6) ? "" : `${random.pick(WORDS)} ${random.pick(WORDS)}`,
  occurredAt: random.pick(TIMESTAMPS),
  profileId: random.chance(0.25) ? otherProfileId : demoProfileId,
  raw: {
    description: `${random.pick(WORDS)} ${random.pick(WORDS)}`,
    merchant: random.pick(WORDS),
    reference: random.chance(0.5) ? "" : `${random.pick(WORDS)}-${index}`,
  },
  review: random.chance(0.5)
    ? ReviewSchema.cases.Awaiting.make({})
    : ReviewSchema.cases.Reviewed.make({
        at: seedTimestamp(1_736_154_000_000),
      }),
  status: random.pick(STATUSES),
  valueDate: "2025-01-06",
});

const dataset = Schema.decodeSync(Schema.Array(BankLineSchema))(
  Array.from({ length: LINE_COUNT }, (_, index) =>
    generatedLine(makeRandom(0x5e_ed_b0_0c + index), index)
  )
);

const profileLines = tuple(
  dataset.filter((line) => line.profileId === demoProfileId)
);

const strangerPerson = Schema.decodeSync(PersonSchema)({
  email: "stranger@example.com",
  memberships: [{ profileId: otherProfileId, role: "owner" }],
  personId: "person-stranger",
});

const bothProfilePerson = Schema.decodeSync(PersonSchema)({
  email: "both-profiles@example.com",
  memberships: [
    { profileId: demoProfileId, role: "owner" },
    { profileId: otherProfileId, role: "owner" },
  ],
  personId: "person-both-profiles",
});

const bothProfileLayer = Layer.mergeAll(
  BankLineService.layer.pipe(
    Layer.provide(
      memoryBankLineStoreLayer({ categories: demoCategories, lines: dataset })
    )
  ),
  Layer.succeed(CurrentPerson, bothProfilePerson)
);

const generatedAmountRange = (random: Random): AmountRange => {
  const first = random.int(-500, 500);
  const second = random.int(-500, 500);

  return {
    currency: random.pick(CURRENCIES),
    max: units(Math.max(first, second)),
    min: units(Math.min(first, second)),
  };
};

const generatedCategory = (random: Random): CategoryFilter => {
  const roll = random.int(0, 2);

  if (roll === 0) {
    return CategoryFilterSchema.cases.Any.make({});
  }

  if (roll === 1) {
    return CategoryFilterSchema.cases.Uncategorised.make({});
  }

  return CategoryFilterSchema.cases.Of.make({
    categoryId: random.pick(CATEGORY_IDS),
  });
};

const generatedReview = (random: Random): ReviewFilter => {
  const roll = random.int(0, 2);

  if (roll === 0) {
    return ReviewFilterSchema.cases.Awaiting.make({});
  }

  if (roll === 1) {
    return ReviewFilterSchema.cases.Reviewed.make({});
  }

  return ReviewFilterSchema.cases.Any.make({});
};

const generatedFilter = (random: Random): BankLineFilter => {
  const first = random.pick(TIMESTAMPS);
  const second = random.pick(TIMESTAMPS);

  return {
    account: random.chance(0.4)
      ? Option.some(random.pick(ACCOUNTS))
      : Option.none(),
    amount: random.chance(0.4)
      ? Option.some(generatedAmountRange(random))
      : Option.none(),
    category: generatedCategory(random),
    direction: random.chance(0.4)
      ? Option.some(random.pick(DIRECTIONS))
      : Option.none(),
    occurred: random.chance(0.4)
      ? Option.some({
          from: first <= second ? first : second,
          to: first <= second ? second : first,
        })
      : Option.none(),
    review: generatedReview(random),
  };
};

const noFilter: BankLineFilter = {
  account: Option.none(),
  amount: Option.none(),
  category: CategoryFilterSchema.cases.Any.make({}),
  direction: Option.none(),
  occurred: Option.none(),
  review: ReviewFilterSchema.cases.Any.make({}),
};

const serviceLayer = Layer.mergeAll(
  BankLineService.layer.pipe(
    Layer.provide(
      memoryBankLineStoreLayer({ categories: demoCategories, lines: dataset })
    )
  ),
  Layer.succeed(CurrentPerson, demoPerson)
);

const request = (
  filter: BankLineFilter,
  search: string,
  limit: number,
  cursor: Option.Option<BankLineCursor> = Option.none()
): ListBankLinesRequest => ({
  cursor,
  filter,
  limit,
  profileId: demoProfileId,
  search,
});

const list = (input: ListBankLinesRequest) =>
  listBankLines.handler(input).pipe(Effect.provide(serviceLayer), Effect.orDie);

const listOutcome = (input: ListBankLinesRequest) =>
  listBankLines
    .handler(input)
    .pipe(Effect.provide(serviceLayer), Effect.result);

const occurredDescending = (left: BankLine, right: BankLine) => {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt > right.occurredAt ? -1 : 1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
};

const referenceAccountKeeps = (
  account: Option.Option<ProviderAccountId>,
  line: BankLine
) => {
  if (Option.isNone(account)) {
    return true;
  }

  return line.accountId === account.value;
};

const referenceAmountKeeps = (
  amount: Option.Option<AmountRange>,
  line: BankLine
) => {
  if (Option.isNone(amount)) {
    return true;
  }

  const range = amount.value;

  return (
    line.amount.currency === range.currency &&
    line.amount.minor >= range.min &&
    line.amount.minor <= range.max
  );
};

const referenceDirectionKeeps = (
  direction: Option.Option<BankLine["direction"]>,
  line: BankLine
) => {
  if (Option.isNone(direction)) {
    return true;
  }

  return line.direction === direction.value;
};

const referenceOccurredKeeps = (
  occurred: Option.Option<OccurredRange>,
  line: BankLine
) => {
  if (Option.isNone(occurred)) {
    return true;
  }

  return (
    line.occurredAt >= occurred.value.from &&
    line.occurredAt <= occurred.value.to
  );
};

const referenceCategoryKeeps = (category: CategoryFilter, line: BankLine) =>
  Match.value(category).pipe(
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

const referenceReviewKeeps = (review: ReviewFilter, line: BankLine) =>
  Match.value(review).pipe(
    Match.tag("Any", () => true),
    Match.tag("Awaiting", () => Predicate.isTagged(line.review, "Awaiting")),
    Match.tag("Reviewed", () => Predicate.isTagged(line.review, "Reviewed")),
    Match.exhaustive
  );

const referenceSearchKeeps = (search: string, line: BankLine) => {
  const needle = search.trim().toLowerCase();

  if (needle === "") {
    return true;
  }

  const text = [
    line.raw.description,
    line.raw.merchant,
    line.raw.reference,
    line.note,
  ];

  return text.some((value) => value.toLowerCase().includes(needle));
};

const referenceKeeps = (
  filter: BankLineFilter,
  search: string,
  line: BankLine
) =>
  referenceAccountKeeps(filter.account, line) &&
  referenceAmountKeeps(filter.amount, line) &&
  referenceDirectionKeeps(filter.direction, line) &&
  referenceOccurredKeeps(filter.occurred, line) &&
  referenceCategoryKeeps(filter.category, line) &&
  referenceReviewKeeps(filter.review, line) &&
  referenceSearchKeeps(search, line);

const referenceIds = (filter: BankLineFilter, search: string) =>
  profileLines
    .filter((line) => referenceKeeps(filter, search, line))
    .toSorted(occurredDescending)
    .map((line) => line.id);

const expectSameAsReference = (
  page: BankLinePage,
  filter: BankLineFilter,
  search: string,
  context: string
) => {
  const expected = referenceIds(filter, search);

  expect(
    page.lines.map((line) => line.id),
    `${context} returned a different set of lines than a plain filter does`
  ).toEqual(expected);

  expect(page.total, `${context} counted another total`).toBe(expected.length);
};

const expectInsideBook = (
  page: BankLinePage,
  book: ReadonlyMap<string, BankLine>,
  context: string
) => {
  for (const line of page.lines) {
    const original = book.get(line.id);

    expect(
      original,
      `${context} returned an unknown line ${line.id}`
    ).toBeDefined();

    expect(line, `${context} rewrote line ${line.id}`).toEqual(original);

    expect(line.profileId, `${context} crossed profiles`).toBe(demoProfileId);
  }

  expect(
    page.lines.length,
    `${context} returned more lines than exist`
  ).toBeLessThanOrEqual(book.size);
};

const expectPagedWalk = (
  pages: readonly BankLinePage[],
  whole: BankLinePage,
  limit: number,
  context: string
) => {
  const walked = pages.flatMap((page) => page.lines.map((line) => line.id));

  expect(new Set(walked).size, `${context} repeated a line across pages`).toBe(
    walked.length
  );

  expect(walked, `${context} dropped or added a line while paging`).toEqual(
    whole.lines.map((line) => line.id)
  );

  for (const page of pages) {
    expect(
      page.lines.length,
      `${context} overfilled a page`
    ).toBeLessThanOrEqual(limit);

    expect(page.total, `${context} changed total between pages`).toBe(
      whole.total
    );
  }
};

const walkPages = (filter: BankLineFilter, search: string, limit: number) =>
  Effect.gen(function* walkBankLinePages() {
    const pages = [];

    let cursor: Option.Option<BankLineCursor> = Option.none();

    for (let step = 0; step < 200; step += 1) {
      const page = yield* list(request(filter, search, limit, cursor));

      pages.push(page);

      if (Option.isNone(page.next)) {
        return pages;
      }

      cursor = page.next;
    }

    throw new Error("Bank line paging never reached its last page");
  });

it.effect(
  "a filtered bank line list is a subset of the unfiltered list and paged walks match it",
  () =>
    Effect.gen(function* checkGeneratedFilters() {
      const random = makeRandom(0x1a_2b_3c_4d);

      const unfiltered = yield* list(request(noFilter, "", 200));

      const unfilteredById = new Map(
        unfiltered.lines.map((line) => [line.id, line] as const)
      );

      expect(unfiltered.lines).toHaveLength(profileLines.length);
      expect(unfiltered.total).toBe(unfiltered.lines.length);

      for (let index = 0; index < PROFILE_CASES; index += 1) {
        const filter = generatedFilter(random);

        const search = random.pick(SEARCH_TEXTS);

        const limit = random.int(1, 7);

        const whole = yield* list(request(filter, search, 200));

        const context = `case ${index}: filter ${JSON.stringify(filter)} search ${search}`;

        expectInsideBook(whole, unfilteredById, context);

        expectSameAsReference(whole, filter, search, context);

        const pages = yield* walkPages(filter, search, limit);

        expectPagedWalk(pages, whole, limit, context);
      }
    })
);

const alphabet = ["a", "E", " ", "\t", "\n", "1", "-", "z"] as const;

it.effect(
  "editing a note keeps its trimmed text and leaves both amounts untouched",
  () =>
    Effect.gen(function* checkGeneratedNotes() {
      const random = makeRandom(0x2b_3c_4d_5e);

      for (let index = 0; index < NOTE_CASES; index += 1) {
        const text = Array.from({ length: random.int(0, 40) }, () =>
          random.pick(alphabet)
        ).join("");

        const target = random.pick(profileLines);

        const edited = yield* editBankLine
          .handler({
            category: CategoryChangeSchema.cases.Unchanged.make({}),
            lineId: target.id,
            note: NoteChangeSchema.cases.Set.make({ text }),
            profileId: demoProfileId,
          })
          .pipe(Effect.provide(serviceLayer), Effect.orDie);

        expect(edited.note, `case ${index} kept untrimmed note text`).toBe(
          text.trim()
        );

        expect(edited.amount, `case ${index} changed the amount`).toEqual(
          target.amount
        );

        expect(
          edited.baseAmount,
          `case ${index} changed the base amount`
        ).toEqual(target.baseAmount);
      }
    })
);

it.effect("the generated book stays inside one profile boundary", () =>
  Effect.gen(function* checkProfileBoundary() {
    const unfiltered = yield* list(request(noFilter, "", 200));

    expect(
      unfiltered.lines.every((line) => line.profileId === demoProfileId)
    ).toBe(true);

    expect(dataset.some((line) => line.profileId === otherProfileId)).toBe(
      true
    );

    const failure = yield* listBankLines
      .handler(request(noFilter, "", 10))
      .pipe(
        Effect.provide(
          Layer.mergeAll(
            BankLineService.layer.pipe(
              Layer.provide(
                memoryBankLineStoreLayer({
                  categories: demoCategories,
                  lines: dataset,
                })
              )
            ),
            Layer.succeed(CurrentPerson, strangerPerson)
          )
        ),
        Effect.flip
      );

    expect(failure._tag).toBe("Forbidden");
  })
);

const flipDirection = (
  filter: BankLineFilter,
  random: Random
): BankLineFilter => ({
  ...filter,
  direction: Option.isNone(filter.direction)
    ? Option.some(random.pick(DIRECTIONS))
    : Option.none(),
});

it.effect(
  "refuses a cursor made in one profile when it is used in another",
  () =>
    Effect.gen(function* checkCrossProfileCursor() {
      const otherLines = dataset.filter(
        (line) => line.profileId === otherProfileId
      );

      expect(otherLines.length).toBeGreaterThan(1);

      const first = yield* listBankLines
        .handler(request(noFilter, "", 1))
        .pipe(Effect.provide(bothProfileLayer), Effect.orDie);

      const cursor = first.next;

      expect(Option.isSome(cursor)).toBe(true);

      if (Option.isSome(cursor)) {
        const second = yield* listBankLines
          .handler({
            ...request(noFilter, "", 1, cursor),
            profileId: otherProfileId,
          })
          .pipe(Effect.provide(bothProfileLayer), Effect.result);

        expect(Predicate.isTagged(second, "Failure")).toBe(true);

        if (Predicate.isTagged(second, "Failure")) {
          expect(
            Predicate.isTagged(second.failure, "CursorFilterMismatch")
          ).toBe(true);
        }
      }
    })
);

it.effect("refuses a cursor made under another filter or another search", () =>
  Effect.gen(function* checkStaleCursors() {
    const random = makeRandom(0x5e_6f_70_81);

    let carriedCursors = 0;

    for (let index = 0; index < 100; index += 1) {
      const filter = generatedFilter(random);

      const search = random.pick(SEARCH_TEXTS);

      const first = yield* list(request(filter, search, 1));

      const cursor = first.next;

      if (Option.isNone(cursor)) {
        continue;
      }

      carriedCursors += 1;

      const sameFilter = yield* listOutcome(request(filter, search, 1, cursor));

      expect(
        Predicate.isTagged(sameFilter, "Success"),
        `case ${index} refused its own cursor`
      ).toBe(true);

      const otherFilter = yield* listOutcome(
        request(flipDirection(filter, random), search, 1, cursor)
      );

      expect(
        Predicate.isTagged(otherFilter, "Failure"),
        `case ${index} accepted a cursor from another filter`
      ).toBe(true);

      if (Predicate.isTagged(otherFilter, "Failure")) {
        expect(
          Predicate.isTagged(otherFilter.failure, "CursorFilterMismatch")
        ).toBe(true);
      }

      const otherSearch = yield* listOutcome(
        request(filter, search === "" ? "Demo" : "", 1, cursor)
      );

      expect(
        Predicate.isTagged(otherSearch, "Failure"),
        `case ${index} accepted a cursor from another search`
      ).toBe(true);

      if (Predicate.isTagged(otherSearch, "Failure")) {
        expect(
          Predicate.isTagged(otherSearch.failure, "CursorFilterMismatch")
        ).toBe(true);
      }
    }

    expect(
      carriedCursors,
      "no generated case produced a cursor"
    ).toBeGreaterThan(0);
  })
);
