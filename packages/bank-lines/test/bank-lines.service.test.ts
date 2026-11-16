import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import {
  editBankLine,
  listBankLines,
  reviewBankLine,
} from "../src/capabilities.js";
import {
  demoBankLines,
  demoCategories,
  demoPerson,
  demoProfileId,
} from "../src/demo.js";
import { memoryBankLineStoreLayer } from "../src/memory.js";
import {
  CategoryChangeSchema,
  CategoryFilterSchema,
  CategoryIdSchema,
  NoteChangeSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  ReviewFilterSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type {
  BankLine,
  BankLineFilter,
  CategoryChange,
  EditBankLineRequest,
  ListBankLinesRequest,
  NoteChange,
  ReviewBankLineRequest,
} from "../src/model.js";
import { BankLineService } from "../src/service.js";

const line = (index: number): BankLine => {
  const found = demoBankLines[index];

  if (found === undefined) {
    throw new Error(`The demo book has no bank line at ${index}`);
  }

  return found;
};

const categoryId = (value: string) =>
  Schema.decodeSync(CategoryIdSchema)(value);

const cloudCategory = categoryId("0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba");

const account = Schema.decodeSync(ProviderAccountIdSchema)(
  "0192f0c1-0006-7b7b-8ffd-ffde623dd8df"
);

const firstQuarterFrom = Schema.decodeSync(TimestampMillisSchema)(
  1_735_689_600_000
);

const firstQuarterTo = Schema.decodeSync(TimestampMillisSchema)(
  1_740_787_200_000
);

const missingLineId = Schema.decodeSync(
  Schema.NonEmptyString.check(Schema.isMaxLength(64)).pipe(
    Schema.brand("BankLineId")
  )
)("line-missing");

const viewerPerson = Schema.decodeSync(PersonSchema)({
  email: "finance@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-viewer",
});

const strangerPerson = Schema.decodeSync(PersonSchema)({
  email: "stranger@example.com",
  memberships: [
    {
      profileId: Schema.decodeSync(ProfileIdSchema)("profile-stranger"),
      role: "owner",
    },
  ],
  personId: "person-stranger",
});

const noFilter: BankLineFilter = {
  account: Option.none(),
  amount: Option.none(),
  category: CategoryFilterSchema.cases.Any.make({}),
  direction: Option.none(),
  occurred: Option.none(),
  review: ReviewFilterSchema.cases.Any.make({}),
};

const layerFor = (person: Person) =>
  Layer.mergeAll(
    BankLineService.layer.pipe(
      Layer.provide(
        memoryBankLineStoreLayer({
          categories: demoCategories,
          lines: demoBankLines,
        })
      )
    ),
    Layer.succeed(CurrentPerson, person)
  );

const asOwner = layerFor(demoPerson);

const request = (
  filter: BankLineFilter,
  search = "",
  limit = 50
): ListBankLinesRequest => ({
  cursor: Option.none(),
  filter,
  limit,
  profileId: demoProfileId,
  search,
});

const withFilter = (filter: Partial<BankLineFilter>): BankLineFilter => ({
  ...noFilter,
  ...filter,
});

const merchants = (lines: readonly BankLine[]) =>
  lines.map((entry) => entry.raw.merchant);

const edit = (input: EditBankLineRequest) => editBankLine.handler(input);

const review = (input: ReviewBankLineRequest) => reviewBankLine.handler(input);

it.effect(
  "lists the demo book newest first with two lines awaiting review",
  () =>
    Effect.gen(function* listDemoBook() {
      const page = yield* listBankLines.handler(request(noFilter));

      expect(page.total).toBe(demoBankLines.length);
      expect(page.lines).toHaveLength(demoBankLines.length);
      expect(Option.isNone(page.next)).toBe(true);

      const occurred = page.lines.map((entry) => entry.occurredAt);

      expect(occurred).toEqual(
        occurred.toSorted((left, right) => right - left)
      );

      expect(
        page.lines.filter((entry) =>
          Predicate.isTagged(entry.review, "Awaiting")
        )
      ).toHaveLength(2);

      expect(
        page.lines.every((entry) =>
          demoBankLines.some((candidate) => candidate.id === entry.id)
        )
      ).toBe(true);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect(
  "filters by direction, category, review, account and occurred range",
  () =>
    Effect.gen(function* filterDemoBook() {
      const incoming = yield* listBankLines.handler(
        request(withFilter({ direction: Option.some("in") }))
      );

      expect(merchants(incoming.lines)).toEqual([
        "Demo Design Tool",
        "Example Ltd",
      ]);

      const awaiting = yield* listBankLines.handler(
        request(
          withFilter({ review: ReviewFilterSchema.cases.Awaiting.make({}) })
        )
      );

      expect(awaiting.total).toBe(2);

      const uncategorised = yield* listBankLines.handler(
        request(
          withFilter({
            category: CategoryFilterSchema.cases.Uncategorised.make({}),
          })
        )
      );

      expect(uncategorised.total).toBe(5);

      const cloud = yield* listBankLines.handler(
        request(
          withFilter({
            category: CategoryFilterSchema.cases.Of.make({
              categoryId: cloudCategory,
            }),
          })
        )
      );

      expect(cloud.total).toBe(2);

      const accountLines = yield* listBankLines.handler(
        request(withFilter({ account: Option.some(account) }))
      );

      expect(accountLines.total).toBe(demoBankLines.length);

      const firstQuarter = yield* listBankLines.handler(
        request(
          withFilter({
            occurred: Option.some({
              from: firstQuarterFrom,
              to: firstQuarterTo,
            }),
          })
        )
      );

      expect(firstQuarter.total).toBe(2);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect(
  "searches merchant, description, reference and note text ignoring case",
  () =>
    Effect.gen(function* searchDemoBook() {
      const lower = yield* listBankLines.handler(request(noFilter, "coffee"));
      const upper = yield* listBankLines.handler(request(noFilter, "COFFEE"));

      expect(lower.total).toBe(2);
      expect(upper.total).toBe(lower.total);

      const tax = yield* listBankLines.handler(request(noFilter, "tax-vat"));

      expect(tax.lines.map((entry) => entry.raw.reference)).toEqual([
        "TAX-VAT-2025",
      ]);

      const note = yield* listBankLines.handler(
        request(noFilter, "team breakfast")
      );

      expect(note.total).toBe(1);

      const nothing = yield* listBankLines.handler(
        request(noFilter, "no such words")
      );

      expect(nothing.total).toBe(0);
      expect(nothing.lines).toEqual([]);
      expect(Option.isNone(nothing.next)).toBe(true);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("saves a category and a note and lists the change", () =>
  Effect.gen(function* editDemoBook() {
    const target = line(7);

    const category: CategoryChange = CategoryChangeSchema.cases.Assigned.make({
      categoryId: cloudCategory,
    });

    const note: NoteChange = NoteChangeSchema.cases.Set.make({
      text: "  checked by demo  ",
    });

    const edited = yield* edit({
      category,
      lineId: target.id,
      note,
      profileId: demoProfileId,
    });

    expect(edited.note).toBe("checked by demo");
    expect(Option.getOrNull(edited.category)).toBe(cloudCategory);
    expect(edited.amount).toEqual(target.amount);
    expect(edited.occurredAt).toBe(target.occurredAt);

    const cloud = yield* listBankLines.handler(
      request(
        withFilter({
          category: CategoryFilterSchema.cases.Of.make({
            categoryId: cloudCategory,
          }),
        })
      )
    );

    expect(cloud.total).toBe(3);
    expect(cloud.lines.some((entry) => entry.id === target.id)).toBe(true);

    const found = yield* listBankLines.handler(
      request(noFilter, "checked by demo")
    );

    expect(found.lines.map((entry) => entry.id)).toEqual([target.id]);

    const cleared = yield* edit({
      category: CategoryChangeSchema.cases.Cleared.make({}),
      lineId: target.id,
      note: NoteChangeSchema.cases.Unchanged.make({}),
      profileId: demoProfileId,
    });

    expect(Option.isNone(cleared.category)).toBe(true);
    expect(cleared.note).toBe("checked by demo");
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("marks a line reviewed once and keeps the first review time", () =>
  Effect.gen(function* reviewDemoBook() {
    const target = line(5);

    expect(Predicate.isTagged(target.review, "Awaiting")).toBe(true);

    const reviewed = yield* review({
      lineId: target.id,
      profileId: demoProfileId,
    });

    expect(Predicate.isTagged(reviewed.review, "Reviewed")).toBe(true);

    const again = yield* review({
      lineId: target.id,
      profileId: demoProfileId,
    });

    expect(again.review).toEqual(reviewed.review);

    const awaiting = yield* listBankLines.handler(
      request(
        withFilter({ review: ReviewFilterSchema.cases.Awaiting.make({}) })
      )
    );

    expect(awaiting.total).toBe(1);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("refuses an unknown line and an unknown category by name", () =>
  Effect.gen(function* refuseIllegalEdits() {
    const missing = yield* edit({
      category: CategoryChangeSchema.cases.Unchanged.make({}),
      lineId: missingLineId,
      note: NoteChangeSchema.cases.Unchanged.make({}),
      profileId: demoProfileId,
    }).pipe(Effect.flip);

    expect(missing._tag).toBe("UnknownBankLine");

    const unknownCategory = yield* edit({
      category: CategoryChangeSchema.cases.Assigned.make({
        categoryId: categoryId("category-unknown"),
      }),
      lineId: line(7).id,
      note: NoteChangeSchema.cases.Unchanged.make({}),
      profileId: demoProfileId,
    }).pipe(Effect.flip);

    expect(unknownCategory._tag).toBe("UnknownCategory");
  }).pipe(Effect.provide(asOwner))
);

it.effect("lets a viewer read and stops the same viewer from writing", () =>
  Effect.gen(function* viewerReads() {
    const page = yield* listBankLines.handler(request(noFilter));

    expect(page.total).toBe(demoBankLines.length);

    const denied = yield* review({
      lineId: line(5).id,
      profileId: demoProfileId,
    }).pipe(Effect.flip);

    expect(denied._tag).toBe("Forbidden");
  }).pipe(Effect.provide(layerFor(viewerPerson)))
);

it.effect("stops a person with no membership from reading a profile", () =>
  Effect.gen(function* strangerCannotRead() {
    const denied = yield* listBankLines
      .handler(request(noFilter))
      .pipe(Effect.flip);

    expect(denied._tag).toBe("Forbidden");
  }).pipe(Effect.provide(layerFor(strangerPerson)))
);
