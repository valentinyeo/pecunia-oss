import { expect, it } from "@effect/vitest";
import { Effect, Ref, Result, Schema } from "effect";

import { makeFakeBank } from "../src/fake-bank.js";
import type { FakeBankPage } from "../src/fake-bank.js";
import { makeMemoryBankLineStore } from "../src/memory-store.js";
import { ProviderIdSchema } from "../src/model.js";
import type { Cursor, ProviderId, RawProviderLine } from "../src/model.js";
import { parsePage } from "../src/parse.js";
import type { BankProviderService } from "../src/provider.js";
import { StoreUnavailable } from "../src/store-unavailable.js";
import type { BankLineStoreService } from "../src/store.js";
import { wiseRecordedPages } from "../src/wise-recorded.js";
import { parseWiseRecordedPage, wiseRecordedProvider } from "../src/wise.js";
import {
  cursorOf,
  expectFailed,
  expectSynced,
  makeRecordingClock,
  runSyncWith,
  syncRequest,
} from "./support.js";

const line = (amountMinor: number, id: string): RawProviderLine => ({
  amountMinor,
  bookedOn: "2026-01-05",
  currency: "GBP",
  description: "Made-up demo line",
  providerLineId: id,
});

const demoLines: readonly RawProviderLine[] = [
  line(1250, "demo-1"),
  line(-500, "demo-2"),
  line(899, "demo-3"),
];

const otherProviderId: ProviderId =
  Schema.decodeSync(ProviderIdSchema)("other-bank");

const failingStore = (reason: string): BankLineStoreService => ({
  storeLines: () => Effect.fail(new StoreUnavailable({ reason })),
});

const failingStoreAfter = (
  inner: BankLineStoreService,
  allowedCalls: number
): Effect.Effect<BankLineStoreService> =>
  Effect.gen(function* guardedStore() {
    const calls = yield* Ref.make(0);

    return {
      storeLines: (providerId, lines) =>
        Effect.gen(function* storeOnce() {
          const call = yield* Ref.updateAndGet(calls, (count) => count + 1);

          if (call > allowedCalls) {
            return yield* new StoreUnavailable({
              reason: "Store failed after the first page",
            });
          }

          return yield* inner.storeLines(providerId, lines);
        }),
    };
  });

interface ScriptedPage {
  readonly requestCursor: Cursor | null;
  readonly nextCursor: Cursor | null;
  readonly lines: readonly RawProviderLine[];
  readonly failuresBeforeSuccess?: number;
}

const scriptedPages = (
  pages: readonly ScriptedPage[]
): readonly FakeBankPage[] =>
  pages.map((page) => ({
    failuresBeforeSuccess: page.failuresBeforeSuccess ?? 0,
    lines: page.lines,
    nextCursor: page.nextCursor,
    requestCursor: page.requestCursor,
  }));

it.effect("retries a failing fetch the number of times the policy allows", () =>
  Effect.gen(function* retriesFetch() {
    const memory = yield* makeMemoryBankLineStore;

    const bank = yield* makeFakeBank(
      scriptedPages([
        {
          failuresBeforeSuccess: 5,
          lines: [line(100, "demo-1")],
          nextCursor: null,
          requestCursor: null,
        },
      ])
    );

    const recorded = yield* makeRecordingClock;

    const outcome = expectFailed(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({ retry: { attempts: 3, delayMillis: 7 } })
      )
    );

    expect(outcome).toMatchObject({
      attempts: 3,
      reason: "FakeBank scripted fetch failure",
      step: "fetchPage",
    });
    expect(yield* recorded.sleeps).toEqual([7, 7]);
    expect(yield* memory.lines).toEqual([]);
  })
);

it.effect("heals a fetch that fails fewer times than the retry budget", () =>
  Effect.gen(function* healsFetch() {
    const memory = yield* makeMemoryBankLineStore;

    const bank = yield* makeFakeBank(
      scriptedPages([
        {
          failuresBeforeSuccess: 2,
          lines: demoLines.slice(0, 2),
          nextCursor: null,
          requestCursor: null,
        },
      ])
    );

    const recorded = yield* makeRecordingClock;

    const outcome = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({ retry: { attempts: 3, delayMillis: 11 } })
      )
    );

    expect(outcome).toMatchObject({ count: 2, rejected: 0 });
    expect(yield* recorded.sleeps).toEqual([11, 11]);
    expect(yield* memory.lines).toHaveLength(2);
  })
);

it.effect(
  "reports the step, reason and attempts when the store never accepts",
  () =>
    Effect.gen(function* storeFails() {
      const bank = yield* makeFakeBank(
        scriptedPages([
          { lines: demoLines, nextCursor: null, requestCursor: null },
        ])
      );

      const recorded = yield* makeRecordingClock;

      const outcome = expectFailed(
        yield* runSyncWith(
          bank.provider,
          failingStore("Store is offline"),
          recorded.clock,
          syncRequest({ retry: { attempts: 2, delayMillis: 3 } })
        )
      );

      expect(outcome).toMatchObject({
        attempts: 2,
        reason: "Store is offline",
        step: "storePage",
      });
      expect("cursor" in outcome).toBe(false);
      expect(yield* recorded.sleeps).toEqual([3]);
    })
);

it.effect("never skips a line when a later page fails to store", () =>
  Effect.gen(function* cursorSafety() {
    const memory = yield* makeMemoryBankLineStore;

    const bank = yield* makeFakeBank(
      scriptedPages([
        {
          lines: [line(1250, "demo-page-1")],
          nextCursor: cursorOf("demo-cursor-1"),
          requestCursor: null,
        },
        {
          lines: [line(-500, "demo-page-2")],
          nextCursor: null,
          requestCursor: cursorOf("demo-cursor-1"),
        },
      ])
    );

    const guarded = yield* failingStoreAfter(memory.store, 1);
    const recorded = yield* makeRecordingClock;

    const failed = expectFailed(
      yield* runSyncWith(
        bank.provider,
        guarded,
        recorded.clock,
        syncRequest({ retry: { attempts: 1, delayMillis: 0 } })
      )
    );

    expect(failed.step).toBe("storePage");
    expect((yield* memory.lines).map((item) => item.providerLineId)).toEqual([
      "demo-page-1",
    ]);

    const healthy = yield* makeRecordingClock;

    const healed = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        healthy.clock,
        syncRequest({})
      )
    );

    expect(healed).toMatchObject({ count: 1, rejected: 0 });
    expect(
      (yield* memory.lines).map((item) => item.providerLineId).toSorted()
    ).toEqual(["demo-page-1", "demo-page-2"]);
    expect([...(yield* memory.totals).entries()]).toEqual([["GBP", 750]]);
  })
);

it.effect("serves a repeated page without doubling a line or a total", () =>
  Effect.gen(function* repeatedPage() {
    const memory = yield* makeMemoryBankLineStore;
    const repeated = demoLines.slice(0, 2);

    const bank = yield* makeFakeBank(
      scriptedPages([
        {
          lines: repeated,
          nextCursor: cursorOf("demo-cursor-repeat"),
          requestCursor: null,
        },
        {
          lines: repeated,
          nextCursor: null,
          requestCursor: cursorOf("demo-cursor-repeat"),
        },
      ])
    );

    const recorded = yield* makeRecordingClock;

    const outcome = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({})
      )
    );

    expect(outcome).toMatchObject({ count: 2, pages: 2, rejected: 0 });
    expect(yield* memory.lines).toHaveLength(2);
    expect([...(yield* memory.totals).entries()]).toEqual([["GBP", 750]]);
  })
);

it.effect("keys stored lines by provider and provider line id", () =>
  Effect.gen(function* providerKeys() {
    const memory = yield* makeMemoryBankLineStore;

    const bank = yield* makeFakeBank(
      scriptedPages([
        { lines: demoLines, nextCursor: null, requestCursor: null },
      ])
    );

    const recorded = yield* makeRecordingClock;

    const first = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({})
      )
    );

    const second = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({ providerId: otherProviderId })
      )
    );

    expect(first.count).toBe(3);
    expect(second.count).toBe(3);
    expect(yield* memory.lines).toHaveLength(6);
    expect(
      [...(yield* memory.totals).entries()].toSorted(([left], [right]) =>
        left.localeCompare(right)
      )
    ).toEqual([["GBP", 3298]]);
  })
);

it.effect(
  "names the field and reason of every rejected line and counts it",
  () =>
    Effect.gen(function* rejectedLines() {
      const rawLines: readonly RawProviderLine[] = [
        line(100, "demo-good"),
        { ...line(0, "demo-bad-amount"), amountMinor: 12.5 },
        { ...line(0, "demo-bad-currency"), currency: "gbp" },
        { ...line(0, "demo-bad-id"), providerLineId: "" },
        { ...line(0, "demo-bad-date"), bookedOn: "2026-02-30" },
      ];

      const parsed = parsePage({ lines: rawLines, nextCursor: null });

      expect(Result.isSuccess(parsed)).toBe(true);

      if (Result.isFailure(parsed)) {
        return;
      }

      expect(parsed.success.lines.map((item) => item.providerLineId)).toEqual([
        "demo-good",
      ]);
      expect(parsed.success.rejected).toEqual([
        {
          field: "amountMinor",
          index: 1,
          rawProviderLineId: "demo-bad-amount",
          reason: "NotASafeInteger",
        },
        {
          field: "currency",
          index: 2,
          rawProviderLineId: "demo-bad-currency",
          reason: "NotACurrencyCode",
        },
        {
          field: "providerLineId",
          index: 3,
          rawProviderLineId: null,
          reason: "EmptyString",
        },
        {
          field: "bookedOn",
          index: 4,
          rawProviderLineId: "demo-bad-date",
          reason: "NotADate",
        },
      ]);

      const memory = yield* makeMemoryBankLineStore;

      const bank = yield* makeFakeBank(
        scriptedPages([
          { lines: rawLines, nextCursor: null, requestCursor: null },
        ])
      );

      const recorded = yield* makeRecordingClock;

      const outcome = expectSynced(
        yield* runSyncWith(
          bank.provider,
          memory.store,
          recorded.clock,
          syncRequest({})
        )
      );

      expect(outcome).toMatchObject({ count: 1, rejected: 4 });
      expect((yield* memory.lines).map((item) => item.providerLineId)).toEqual([
        "demo-good",
      ]);
    })
);

it.effect("fails the parse step instead of losing an invalid cursor", () =>
  Effect.gen(function* invalidCursor() {
    const provider: BankProviderService = {
      fetchPage: () => Effect.succeed({ lines: [], nextCursor: 42 }),
    };

    const memory = yield* makeMemoryBankLineStore;
    const recorded = yield* makeRecordingClock;

    const outcome = expectFailed(
      yield* runSyncWith(
        provider,
        memory.store,
        recorded.clock,
        syncRequest({})
      )
    );

    expect(outcome).toMatchObject({ attempts: 1, step: "parsePage" });
    expect(outcome.reason).toContain("not a non-empty string");
  })
);

it.effect("stops at the declared page bound", () =>
  Effect.gen(function* pageBound() {
    const memory = yield* makeMemoryBankLineStore;

    const bank = yield* makeFakeBank(
      scriptedPages([
        {
          lines: [line(100, "demo-1")],
          nextCursor: cursorOf("demo-cursor-1"),
          requestCursor: null,
        },
        {
          lines: [line(200, "demo-2")],
          nextCursor: cursorOf("demo-cursor-2"),
          requestCursor: cursorOf("demo-cursor-1"),
        },
        {
          lines: [line(300, "demo-3")],
          nextCursor: null,
          requestCursor: cursorOf("demo-cursor-2"),
        },
      ])
    );

    const recorded = yield* makeRecordingClock;

    const outcome = expectSynced(
      yield* runSyncWith(
        bank.provider,
        memory.store,
        recorded.clock,
        syncRequest({ maxPages: 2 })
      )
    );

    expect(outcome).toMatchObject({
      count: 2,
      cursor: "demo-cursor-2",
      pages: 2,
    });
    expect((yield* memory.lines).map((item) => item.providerLineId)).toEqual([
      "demo-1",
      "demo-2",
    ]);
    expect(yield* bank.fetchedCursors).toEqual([null, "demo-cursor-1"]);
  })
);

it.effect("syncs the made-up Wise recording through the same port", () =>
  Effect.gen(function* wiseRecording() {
    const provider = wiseRecordedProvider(wiseRecordedPages);

    expect(Result.isSuccess(provider)).toBe(true);

    if (Result.isFailure(provider)) {
      return;
    }

    const firstPage = parseWiseRecordedPage(wiseRecordedPages[0], 0);

    expect(Result.isSuccess(firstPage)).toBe(true);

    if (Result.isSuccess(firstPage)) {
      expect(Result.isSuccess(parsePage(firstPage.success))).toBe(true);
    }

    const memory = yield* makeMemoryBankLineStore;
    const recorded = yield* makeRecordingClock;

    const outcome = expectSynced(
      yield* runSyncWith(
        provider.success,
        memory.store,
        recorded.clock,
        syncRequest({})
      )
    );

    expect(outcome).toMatchObject({ count: 3, pages: 2, rejected: 0 });
    expect(
      (yield* memory.lines).map((item) => item.description).toSorted()
    ).toEqual(["Demo Client Invoice", "Example Cafe", "Sample Bookshop"]);
    expect(
      [...(yield* memory.totals).entries()].toSorted(([left], [right]) =>
        left.localeCompare(right)
      )
    ).toEqual([
      ["EUR", -899],
      ["GBP", 3650],
    ]);
  })
);
