import { Effect, Option, Predicate, Ref, Schema } from "effect";

import {
  AccountIdSchema,
  CursorSchema,
  ProviderIdSchema,
} from "../src/model.js";
import type {
  AccountId,
  Cursor,
  ProviderId,
  RawProviderLine,
} from "../src/model.js";
import { BankProvider } from "../src/provider.js";
import type { BankProviderService, PageRequest } from "../src/provider.js";
import { RetryClock } from "../src/retry.js";
import type { RetryClockService } from "../src/retry.js";
import { BankLineStore } from "../src/store.js";
import type { BankLineStoreService } from "../src/store.js";
import { runSync } from "../src/sync.js";
import type { SyncOutcome, SyncRequest } from "../src/sync.js";

export const demoAccountId: AccountId = Schema.decodeSync(AccountIdSchema)(
  "demo-account-primary"
);

export const demoProviderId: ProviderId =
  Schema.decodeSync(ProviderIdSchema)("demo-bank");

export const cursorOf = (text: string): Cursor =>
  Option.getOrThrow(Schema.decodeOption(CursorSchema)(text));

export const makeRandom = (initial: number) => {
  let state = initial % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_646;
  };
};

export type Random = () => number;

export const pick = <A>(random: Random, values: readonly [A, ...A[]]): A =>
  values[Math.floor(random() * values.length)] ?? values[0];

export const randomInteger = (
  random: Random,
  low: number,
  high: number
): number => {
  const span = high - low + 1;

  return Math.min(high, low + Math.floor(random() * span));
};

export const shuffled = <A>(random: Random, values: readonly A[]): A[] => {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInteger(random, 0, index);
    const held = copy[index];

    if (held !== undefined) {
      copy[index] = copy[swap] ?? held;
      copy[swap] = held;
    }
  }

  return copy;
};

export interface RecordingClock {
  readonly clock: RetryClockService;
  readonly sleeps: Effect.Effect<readonly number[]>;
}

export const makeRecordingClock: Effect.Effect<RecordingClock> = Effect.gen(
  function* recordingClock() {
    const sleeps = yield* Ref.make<readonly number[]>([]);

    return {
      clock: {
        sleep: (millis) => Ref.update(sleeps, (all) => [...all, millis]),
      },
      sleeps: Ref.get(sleeps),
    };
  }
);

export const runSyncWith = (
  provider: BankProviderService,
  store: BankLineStoreService,
  clock: RetryClockService,
  request: SyncRequest
): Effect.Effect<SyncOutcome> =>
  runSync(request).pipe(
    Effect.provideService(BankProvider, provider),
    Effect.provideService(BankLineStore, store),
    Effect.provideService(RetryClock, clock)
  );

export const syncRequest = (overrides: Partial<SyncRequest>): SyncRequest => ({
  accountId: demoAccountId,
  maxPages: 10,
  providerId: demoProviderId,
  retry: { attempts: 3, delayMillis: 5 },
  startCursor: null,
  ...overrides,
});

export interface GeneratedLine {
  readonly amountMinor: number;
  readonly bookedOn: string;
  readonly currency: string;
  readonly id: string;
}

export const toRawLine = (line: GeneratedLine): RawProviderLine => ({
  amountMinor: line.amountMinor,
  bookedOn: line.bookedOn,
  currency: line.currency,
  description: "Made-up demo line",
  providerLineId: line.id,
});

export const servedCursors = (
  requests: readonly PageRequest[]
): readonly (Cursor | null)[] => requests.map((request) => request.cursor);

export const totalByCurrency = (
  lines: readonly GeneratedLine[]
): ReadonlyMap<string, number> => {
  const totals = new Map<string, number>();

  for (const line of lines) {
    totals.set(
      line.currency,
      (totals.get(line.currency) ?? 0) + line.amountMinor
    );
  }

  return totals;
};

export const nonEmpty = <A>(values: readonly A[]): readonly [A, ...A[]] => {
  const [first] = values;

  if (first === undefined) {
    throw new Error("A demo pool needs at least one value");
  }

  return [first, ...values.slice(1)];
};

export const expectSynced = (outcome: SyncOutcome) => {
  if (Predicate.isTagged(outcome, "Synced")) {
    return outcome;
  }

  throw new Error("Expected a Synced outcome but the sync failed");
};

export const expectFailed = (outcome: SyncOutcome) => {
  if (Predicate.isTagged(outcome, "Failed")) {
    return outcome;
  }

  throw new Error("Expected a Failed outcome but the sync succeeded");
};
