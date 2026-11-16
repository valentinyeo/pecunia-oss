import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import {
  demoCategories,
  makeFakeSorter,
  parseProviderAnswer,
  SortingProvider,
  sortLines,
  SuggestionSchema,
} from "../src/index.js";
import type { CategoryChoice, SortableLine, Suggestion } from "../src/index.js";
import {
  category,
  confidence,
  makeLine,
  personAssigned,
  providerName,
  suggested,
  suggestion as suggestionValue,
  unsorted,
} from "./fixtures.js";

const oneLineRequest = (description: string, lineId = "line-1") => ({
  categories: demoCategories,
  lines: [makeLine({ categorization: unsorted(), description, id: lineId })],
});

const onlyLine = <A>(lines: readonly A[]): A | undefined => lines[0];

const invalidAnswer = SuggestionSchema.cases.NoSuggestion.make({
  reason: "invalid-answer",
});

const expectInvalidAnswer = (suggestion: Suggestion) => {
  expect(suggestion).toStrictEqual(invalidAnswer);
};

describe("parseProviderAnswer", () => {
  it("accepts a listed category with a confidence inside the range", () => {
    const suggestion = parseProviderAnswer(
      { categoryId: "category-cafe", confidence: 0.9, kind: "suggested" },
      demoCategories
    );

    expect(suggestion).toStrictEqual(suggestionValue("category-cafe", 0.9));
  });

  it("turns a category outside the list into an invalid answer", () => {
    const suggestion = parseProviderAnswer(
      {
        categoryId: "category-not-offered",
        confidence: 0.9,
        kind: "suggested",
      },
      demoCategories
    );

    expectInvalidAnswer(suggestion);
  });

  it("turns NaN and out-of-range confidences into invalid answers", () => {
    for (const value of [Number.NaN, -0.1, 1.1, Number.POSITIVE_INFINITY]) {
      const suggestion = parseProviderAnswer(
        { categoryId: "category-cafe", confidence: value, kind: "suggested" },
        demoCategories
      );

      expectInvalidAnswer(suggestion);
    }
  });

  it("turns a malformed answer into an invalid answer", () => {
    const suggestion = parseProviderAnswer(
      { confidence: 0.9, kind: "suggested" },
      demoCategories
    );

    expectInvalidAnswer(suggestion);
  });
});

describe("sortLines", () => {
  it.effect(
    "stores a confident suggestion with its provider and confidence",
    () =>
      Effect.gen(function* confidentSuggestion() {
        const result = yield* sortLines(oneLineRequest("Example Cafe")).pipe(
          Effect.provideService(SortingProvider, makeFakeSorter())
        );

        expect(result.failures).toStrictEqual([]);
        expect(onlyLine(result.lines)?.categorization).toStrictEqual(
          suggested("category-cafe", 0.92, "fake-sorter")
        );
      })
  );

  it.effect(
    "leaves the line unsorted when confidence is below the threshold",
    () =>
      Effect.gen(function* belowThreshold() {
        const result = yield* sortLines({
          ...oneLineRequest("Example Cafe"),
          settings: { threshold: confidence(0.95), timeoutMillis: 1000 },
        }).pipe(Effect.provideService(SortingProvider, makeFakeSorter()));

        expect(result.failures).toStrictEqual([]);
        expect(onlyLine(result.lines)?.categorization).toStrictEqual(
          unsorted()
        );
      })
  );

  it.effect("never stores a category the provider invented", () =>
    Effect.gen(function* unknownCategory() {
      const result = yield* sortLines(oneLineRequest("Example Cafe")).pipe(
        Effect.provideService(
          SortingProvider,
          makeFakeSorter({ mode: "unknown-category" })
        )
      );

      expect(result.failures).toStrictEqual([]);
      expect(onlyLine(result.lines)?.categorization).toStrictEqual(unsorted());
    })
  );

  it.effect("never stores a suggestion a provider invented", () =>
    Effect.gen(function* lyingProvider() {
      const provider = {
        name: providerName("lying-sorter"),
        suggest: () =>
          Effect.succeed(suggestionValue("category-not-offered", 0.99)),
      };

      const result = yield* sortLines(oneLineRequest("Example Cafe")).pipe(
        Effect.provideService(SortingProvider, provider)
      );

      expect(result.failures).toStrictEqual([]);
      expect(onlyLine(result.lines)?.categorization).toStrictEqual(unsorted());
    })
  );

  it.effect("never stores a NaN confidence", () =>
    Effect.gen(function* badConfidence() {
      const result = yield* sortLines(oneLineRequest("Example Cafe")).pipe(
        Effect.provideService(
          SortingProvider,
          makeFakeSorter({ mode: "bad-confidence" })
        )
      );

      expect(result.failures).toStrictEqual([]);
      expect(onlyLine(result.lines)?.categorization).toStrictEqual(unsorted());
    })
  );

  it.effect("never stores a malformed provider answer", () =>
    Effect.gen(function* malformedAnswer() {
      const result = yield* sortLines(oneLineRequest("Example Cafe")).pipe(
        Effect.provideService(
          SortingProvider,
          makeFakeSorter({ mode: "malformed" })
        )
      );

      expect(result.failures).toStrictEqual([]);
      expect(onlyLine(result.lines)?.categorization).toStrictEqual(unsorted());
    })
  );

  it.effect("never asks about a line a person already categorised", () =>
    Effect.gen(function* personAssignedLine() {
      const line = makeLine({
        categorization: personAssigned("category-travel"),
        description: "Example Cafe",
        id: "line-1",
      });

      const result = yield* sortLines({
        categories: demoCategories,
        lines: [line],
      }).pipe(
        Effect.provideService(
          SortingProvider,
          makeFakeSorter({ mode: "throw" })
        )
      );

      expect(result.failures).toStrictEqual([]);
      expect(onlyLine(result.lines)?.categorization).toStrictEqual(
        personAssigned("category-travel")
      );
    })
  );

  it.effect(
    "reports a throwing provider by name and carries on with the batch",
    () =>
      Effect.gen(function* throwingProvider() {
        const provider = {
          name: providerName("carrying-sorter"),
          suggest: (
            line: SortableLine,
            categories: readonly CategoryChoice[]
          ) =>
            line.id === "line-throws"
              ? Effect.die(new Error("The planned provider failure"))
              : Effect.succeed(
                  parseProviderAnswer(
                    {
                      categoryId: "category-cafe",
                      confidence: 0.9,
                      kind: "suggested",
                    },
                    categories
                  )
                ),
        };

        const result = yield* sortLines({
          categories: demoCategories,
          lines: [
            makeLine({
              categorization: unsorted(),
              description: "Example Cafe",
              id: "line-throws",
            }),
            makeLine({
              categorization: unsorted(),
              description: "Demo Rail",
              id: "line-carries-on",
            }),
          ],
        }).pipe(Effect.provideService(SortingProvider, provider));

        expect(result.failures).toStrictEqual([
          {
            lineId: "line-throws",
            provider: "carrying-sorter",
            reason: "failed",
          },
        ]);
        expect(result.lines[0]?.categorization).toStrictEqual(unsorted());
        expect(result.lines[1]?.categorization).toStrictEqual(
          suggested("category-cafe", 0.9, "carrying-sorter")
        );
      })
  );

  it.effect(
    "times out a hanging provider, reports it, and leaves the line unsorted",
    () =>
      Effect.gen(function* hangingProvider() {
        const fiber = yield* sortLines({
          ...oneLineRequest("Example Cafe"),
          settings: { threshold: confidence(0.8), timeoutMillis: 1000 },
        }).pipe(
          Effect.provideService(
            SortingProvider,
            makeFakeSorter({ mode: "hang" })
          ),
          Effect.forkChild
        );

        yield* TestClock.adjust("1 second");

        const result = yield* Fiber.join(fiber);

        expect(result.failures).toStrictEqual([
          { lineId: "line-1", provider: "fake-sorter", reason: "timed-out" },
        ]);
        expect(onlyLine(result.lines)?.categorization).toStrictEqual(
          unsorted()
        );
      })
  );

  it.effect("running the sort twice changes nothing", () =>
    Effect.gen(function* idempotentRun() {
      const lines = [
        makeLine({
          categorization: unsorted(),
          description: "Example Cafe",
          id: "line-1",
        }),
        makeLine({
          categorization: personAssigned("category-housing"),
          description: "Sample Landlord",
          id: "line-2",
        }),
        makeLine({
          categorization: suggested("category-travel", 0.95, "earlier-sorter"),
          description: "Demo Rail",
          id: "line-3",
        }),
      ];

      const request = { categories: demoCategories, lines };
      const provider = makeFakeSorter();

      const first = yield* sortLines(request).pipe(
        Effect.provideService(SortingProvider, provider)
      );

      const second = yield* sortLines({
        ...request,
        lines: first.lines,
      }).pipe(Effect.provideService(SortingProvider, provider));

      expect(second.lines).toStrictEqual(first.lines);
      expect(second.failures).toStrictEqual(first.failures);
    })
  );
});

describe("demo categories", () => {
  it("are made-up names with made-up ids", () => {
    expect(demoCategories.map((entry) => entry.id)).toStrictEqual([
      "category-cafe",
      "category-travel",
      "category-housing",
    ]);
    expect(category("category-cafe", "Cafe").name).toBe("Cafe");
  });
});
