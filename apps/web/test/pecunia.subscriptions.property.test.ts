import { expect, it } from "@effect/vitest";
import {
  applyStatusChange,
  CurrencyCodeSchema,
  isActiveStatus,
  pageOf as storedPageOf,
  shiftDays,
  StatusChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  SubscriptionSchema,
  statusWith,
  TimestampMillisSchema,
  viewOf,
} from "@pecunia/subscriptions";
import type {
  Frequency,
  StatusChange,
  StatusTag,
  SubscriptionEntry,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionPage,
  TimestampMillis,
} from "@pecunia/subscriptions";
import { demoProfileId } from "@pecunia/subscriptions/demo";
import { Option, Result, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { Message } from "../src/client/pecunia/subscriptions/message.js";
import type { SubscriptionsMessageValue } from "../src/client/pecunia/subscriptions/message.js";
import {
  activeFilter,
  allFilter,
  initialSubscriptions,
  nextChargeShown,
  pageOf as shownPage,
  rowsOf,
} from "../src/client/pecunia/subscriptions/model.js";
import type {
  SubscriptionRoleValue,
  SubscriptionsScreenValue,
} from "../src/client/pecunia/subscriptions/model.js";
import {
  open as openSubscriptions,
  update as updateSubscriptions,
} from "../src/client/pecunia/subscriptions/update.js";

const CASES = 600;

const SEED = 24_092_409;

const AT: TimestampMillis = Schema.decodeSync(TimestampMillisSchema)(
  1_770_000_000_000
);

const baseCurrency = Schema.decodeSync(CurrencyCodeSchema)("EUR");

type Subscription = typeof SubscriptionSchema.Type;

interface Generator {
  readonly chance: (probability: number) => boolean;
  readonly count: (max: number) => number;
  readonly pick: <Value>(values: readonly [Value, ...Value[]]) => Value;
}

const seededGenerator = (seed: number): Generator => {
  let state = seed % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  const next = () => {
    state = (state * 16_807) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };

  return {
    chance: (probability) => next() < probability,
    count: (max) => Math.floor(next() * max),
    pick: (values) => values[Math.floor(next() * values.length)] ?? values[0],
  };
};

const FREQUENCIES: readonly [Frequency, ...Frequency[]] = [
  "annual",
  "monthly",
  "quarterly",
  "weekly",
];

const STATUSES: readonly [StatusTag, ...StatusTag[]] = [
  "Cancelled",
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
];

const stringField = (generate: Generator, max: number): string =>
  `demo-${generate.count(max)}`;

const subscriptionOf = (generate: Generator, index: number): Subscription =>
  Schema.decodeSync(SubscriptionSchema)({
    amount: { currency: "EUR", minor: 100 + generate.count(1_000_000) },
    baseAmount: { currency: "EUR", minor: 100 + generate.count(1_000_000) },
    categoryId: null,
    confidence: generate.count(101) / 100,
    frequency: generate.pick(FREQUENCIES),
    id: `subscription-${index}`,
    lastChargedOn: shiftDays("2025-01-01", generate.count(400)),
    nextExpectedOn: shiftDays("2025-01-01", generate.count(400)),
    occurrenceCount: 3 + generate.count(10),
    payeeId: stringField(generate, 5),
    profileId: demoProfileId,
    status: statusWith(generate.pick(STATUSES), AT),
  });

const bookOf = (generate: Generator): readonly SubscriptionEntry[] => {
  const size = 1 + generate.count(6);

  return Array.from({ length: size }, (_, index) => {
    const subscription = subscriptionOf(generate, index);

    return { payeeName: `Demo Payee ${index}`, subscription };
  });
};

const entryIn = (
  book: readonly SubscriptionEntry[],
  subscriptionId: SubscriptionId
): Option.Option<SubscriptionEntry> =>
  Option.fromUndefinedOr(
    book.find((entry) => entry.subscription.id === subscriptionId)
  );

const withRow = (
  book: readonly SubscriptionEntry[],
  changed: Subscription
): readonly SubscriptionEntry[] =>
  book.map((entry) =>
    entry.subscription.id === changed.id
      ? { ...entry, subscription: changed }
      : entry
  );

const LoadArgs = Schema.Struct({
  filter: SubscriptionFilterSchema,
  generation: Schema.Int,
});

const StatusArgs = Schema.Struct({
  change: StatusChangeSchema,
  subscriptionId: SubscriptionIdSchema,
});

const Pending = defineTaggedUnion({
  Load: { filter: SubscriptionFilterSchema, generation: Schema.Int },
  Status: { change: StatusChangeSchema, subscriptionId: SubscriptionIdSchema },
});

type PendingValue = typeof Pending.Type;

const pendingOf = (
  commands: readonly Readonly<{ args?: object; name: string }>[]
): readonly PendingValue[] =>
  commands.map((command) =>
    command.name === "ChangeStatus"
      ? Pending.Status(Schema.decodeUnknownSync(StatusArgs)(command.args))
      : Pending.Load(Schema.decodeUnknownSync(LoadArgs)(command.args))
  );

interface Simulation {
  readonly book: readonly SubscriptionEntry[];
  readonly pending: readonly PendingValue[];
  readonly role: SubscriptionRoleValue;
  readonly screen: SubscriptionsScreenValue;
}

const send = (
  simulation: Simulation,
  message: SubscriptionsMessageValue
): Simulation => {
  const result = updateSubscriptions(
    simulation.screen,
    simulation.role,
    message
  );

  const added = pendingOf(result.commands ?? []);

  for (const item of added) {
    Pending.match(item, {
      Load: () => {},
      Status: ({ change, subscriptionId }) => {
        const entry = entryIn(simulation.book, subscriptionId);

        expect(Option.isSome(entry)).toBe(true);

        if (Option.isSome(entry)) {
          expect(
            Result.isSuccess(
              applyStatusChange(entry.value.subscription, change, AT)
            )
          ).toBe(true);
        }
      },
    });
  }

  return {
    book: simulation.book,
    pending: [...simulation.pending, ...added],
    role: simulation.role,
    screen: result.model,
  };
};

const storedPage = (
  simulation: Simulation,
  filter: SubscriptionFilter
): SubscriptionPage =>
  Result.getOrThrow(storedPageOf(simulation.book, filter, baseCurrency));

const resolveOne = (simulation: Simulation, item: PendingValue): Simulation =>
  Pending.match(item, {
    Load: ({ filter, generation }) =>
      send(
        simulation,
        Message.CompletedLoad({
          generation,
          page: storedPage(simulation, filter),
        })
      ),
    Status: ({ change, subscriptionId }) =>
      Option.match(entryIn(simulation.book, subscriptionId), {
        onNone: () =>
          send(
            simulation,
            Message.FailedStatus({
              reason: "The repeat payments changed before the notice landed.",
              subscriptionId,
            })
          ),
        onSome: (entry) => {
          const changed = applyStatusChange(entry.subscription, change, AT);

          if (Result.isFailure(changed)) {
            return send(
              simulation,
              Message.FailedStatus({
                reason: `${changed.failure.message} Fix: ${changed.failure.repair}`,
                subscriptionId,
              })
            );
          }

          const view = Result.getOrThrow(
            viewOf(
              { payeeName: entry.payeeName, subscription: changed.success },
              baseCurrency
            )
          );

          return send(
            {
              ...simulation,
              book: withRow(simulation.book, changed.success),
            },
            Message.CompletedStatus({ view })
          );
        },
      }),
  });

const resolveAll = (simulation: Simulation): Simulation => {
  let current: Simulation = { ...simulation, pending: [] };

  for (const item of simulation.pending) {
    current = resolveOne(current, item);
  }

  return current;
};

const open = (simulation: Simulation): Simulation => {
  const result = openSubscriptions(simulation.screen);

  return {
    ...simulation,
    pending: pendingOf(result.commands ?? []),
    screen: result.model,
  };
};

const pendingStatuses = (simulation: Simulation): number =>
  simulation.pending.filter((item) => Pending.guards.Status(item)).length;

const expectInvariants = (simulation: Simulation) => {
  expect(pendingStatuses(simulation)).toBeLessThanOrEqual(1);

  if (simulation.role === "viewer") {
    expect(pendingStatuses(simulation)).toBe(0);
  }

  Option.match(shownPage(simulation.screen.list), {
    onNone: () => {},
    onSome: (shown) => {
      expect(shown).toStrictEqual(
        storedPage(simulation, simulation.screen.filter)
      );

      for (const row of rowsOf(simulation.screen.list)) {
        expect(Option.isSome(nextChargeShown(row))).toBe(
          isActiveStatus(row.status)
        );
        expect(row.id).toBe(
          simulation.book.find((entry) => entry.subscription.id === row.id)
            ?.subscription.id
        );
      }
    },
  });
};

const idFor = (generate: Generator, simulation: Simulation) => {
  const entry = Option.fromUndefinedOr(
    simulation.book[generate.count(simulation.book.length)]
  );

  return Option.match(entry, {
    onNone: () => Schema.decodeSync(SubscriptionIdSchema)("subscription-99"),
    onSome: (found) => found.subscription.id,
  });
};

const step = (generate: Generator, simulation: Simulation): Simulation => {
  const choice = generate.count(10);

  if (choice < 4) {
    const filter = generate.chance(0.5) ? allFilter : activeFilter;

    return send(simulation, Message.ChoseFilter({ filter }));
  }

  if (choice < 7) {
    return send(
      simulation,
      Message.RequestedCancel({ subscriptionId: idFor(generate, simulation) })
    );
  }

  if (choice < 8) {
    return send(
      simulation,
      Message.RequestedRestore({ subscriptionId: idFor(generate, simulation) })
    );
  }

  if (choice < 9) {
    return send(simulation, Message.Retried());
  }

  return resolveAll(simulation);
};

it("the subscriptions screen converges on the stored page and never sends an illegal notice", () => {
  const generate = seededGenerator(SEED);

  for (let index = 0; index < CASES; index += 1) {
    let simulation: Simulation = resolveAll(
      open({
        book: bookOf(generate),
        pending: [],
        role: generate.chance(0.25) ? "viewer" : "owner",
        screen: initialSubscriptions,
      })
    );

    expectInvariants(simulation);

    const steps = 1 + generate.count(8);

    for (let taken = 0; taken < steps; taken += 1) {
      simulation = step(generate, simulation);
      expectInvariants(simulation);
    }

    simulation = resolveAll(simulation);
    expectInvariants(simulation);

    const settled = simulation.book;

    simulation = resolveAll(send(simulation, Message.Retried()));
    expectInvariants(simulation);

    expect(simulation.book).toStrictEqual(settled);
  }
}, 60_000);

const changeIn = (
  commands: readonly Readonly<{ args?: object; name: string }>[] | undefined
): Option.Option<StatusChange> =>
  Option.map(
    Option.fromUndefinedOr(
      commands?.find((command) => command.name === "ChangeStatus")
    ),
    (command) => Schema.decodeUnknownSync(StatusArgs)(command.args).change
  );

const screenWithPage = (
  page: SubscriptionPage,
  role: SubscriptionRoleValue
): SubscriptionsScreenValue =>
  updateSubscriptions(
    openSubscriptions(initialSubscriptions).model,
    role,
    Message.CompletedLoad({ generation: 2, page })
  ).model;

it("the change the screen offers is one the service accepts", () => {
  const generate = seededGenerator(SEED + 1);
  const id = Schema.decodeSync(SubscriptionIdSchema)("subscription-0");
  const cancel: StatusChange = StatusChangeSchema.cases.Cancel.make({});

  for (let index = 0; index < 500; index += 1) {
    const role: SubscriptionRoleValue = generate.chance(0.2)
      ? "viewer"
      : "owner";

    const tag = generate.pick(STATUSES);

    const subscription: Subscription = {
      ...subscriptionOf(generate, 0),
      status: statusWith(tag, AT),
    };

    const entry: SubscriptionEntry = {
      payeeName: "Demo Payee 0",
      subscription,
    };

    const page: SubscriptionPage = Result.getOrThrow(
      storedPageOf([entry], allFilter, baseCurrency)
    );

    const screen = screenWithPage(page, role);

    const requestedCancel = updateSubscriptions(
      screen,
      role,
      Message.RequestedCancel({ subscriptionId: id })
    );

    const offeredCancel = changeIn(requestedCancel.commands);

    Option.match(offeredCancel, {
      onNone: () => {},
      onSome: (change) => {
        expect(
          Result.isSuccess(applyStatusChange(subscription, change, AT))
        ).toBe(true);
      },
    });

    const cancelOffered = Option.isSome(offeredCancel);

    expect(cancelOffered).toBe(
      role === "owner" && isActiveStatus(subscription.status)
    );

    if (!cancelOffered) {
      const requestedRestore = updateSubscriptions(
        screen,
        role,
        Message.RequestedRestore({ subscriptionId: id })
      );

      expect(Option.isNone(changeIn(requestedRestore.commands))).toBe(true);
      continue;
    }

    const cancelledSubscription = Result.getOrThrow(
      applyStatusChange(subscription, cancel, AT)
    );

    expect(cancelledSubscription.status._tag).toBe("Cancelled");

    const cancelledView = Result.getOrThrow(
      viewOf(
        { payeeName: entry.payeeName, subscription: cancelledSubscription },
        baseCurrency
      )
    );

    const cancelledPage: SubscriptionPage = Result.getOrThrow(
      storedPageOf(
        [{ payeeName: entry.payeeName, subscription: cancelledSubscription }],
        allFilter,
        baseCurrency
      )
    );

    const afterCancel = updateSubscriptions(
      updateSubscriptions(
        requestedCancel.model,
        role,
        Message.CompletedStatus({ view: cancelledView })
      ).model,
      role,
      Message.CompletedLoad({ generation: 3, page: cancelledPage })
    ).model;

    const requestedRestore = updateSubscriptions(
      afterCancel,
      role,
      Message.RequestedRestore({ subscriptionId: id })
    );

    const offeredRestore = changeIn(requestedRestore.commands);

    expect(Option.isSome(offeredRestore)).toBe(true);

    Option.match(offeredRestore, {
      onNone: () => {},
      onSome: (change) => {
        const restored = applyStatusChange(cancelledSubscription, change, AT);

        expect(Result.isSuccess(restored)).toBe(true);

        if (Result.isSuccess(restored)) {
          expect(restored.success.status._tag).toBe(tag);
        }
      },
    });
  }
}, 30_000);
