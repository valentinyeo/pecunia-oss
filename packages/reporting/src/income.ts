import { Effect, Match, Option } from "effect";

import { monthOfDate } from "./date.js";
import { unknownClientOf } from "./errors.js";
import type { ReportOverflow, UnknownClient } from "./errors.js";
import type { Flow } from "./flows.js";
import type {
  ClientIncome,
  ClientMonth,
  ClientRecord,
  PayeeId,
  YearMonth,
} from "./model.js";
import { compareText, minorOrOverflow, zeroShare } from "./money.js";
import { allocateShares } from "./shares.js";
import type { ShareTarget } from "./shares.js";

interface ClientBucket {
  readonly client: ClientRecord;
  readonly months: Map<YearMonth, bigint>;
  readonly total: bigint;
}

export const incomeClientIdOf = (flow: Flow): Option.Option<PayeeId> =>
  Match.value(flow.transaction.classification).pipe(
    Match.tag("Income", ({ clientPayeeId }) => Option.some(clientPayeeId)),
    Match.orElse(() => Option.none<PayeeId>())
  );

const monthOf = (flow: Flow): YearMonth =>
  monthOfDate(flow.transaction.valueDate);

const clientIdsOf = (flows: readonly Flow[]): readonly PayeeId[] => {
  const ids = new Set<PayeeId>();

  for (const flow of flows) {
    if (flow.kind === "income") {
      Option.map(incomeClientIdOf(flow), (clientId) => {
        ids.add(clientId);
      });
    }
  }

  return [...ids];
};

const bucketsOf = (
  flows: readonly Flow[],
  payees: ReadonlyMap<string, string>,
  client: Option.Option<PayeeId>
): ReadonlyMap<string, ClientBucket> => {
  const buckets = new Map<string, ClientBucket>();

  for (const flow of flows) {
    const clientId = incomeClientIdOf(flow);

    if (flow.kind !== "income" || Option.isNone(clientId)) {
      continue;
    }

    if (Option.isSome(client) && client.value !== clientId.value) {
      continue;
    }

    const name = payees.get(clientId.value) ?? "";

    const current = buckets.get(clientId.value) ?? {
      client: { name, payeeId: clientId.value },
      months: new Map<YearMonth, bigint>(),
      total: 0n,
    };

    const month = monthOf(flow);

    current.months.set(
      month,
      (current.months.get(month) ?? 0n) + BigInt(flow.amount.minor)
    );
    buckets.set(clientId.value, {
      client: current.client,
      months: current.months,
      total: current.total + BigInt(flow.amount.minor),
    });
  }

  return buckets;
};

const seriesOf = (
  bucket: ClientBucket,
  months: readonly YearMonth[]
): Effect.Effect<readonly ClientMonth[], ReportOverflow> =>
  Effect.gen(function* clientSeries() {
    const series = yield* Effect.forEach([...months], (month) =>
      Effect.map(
        minorOrOverflow(
          bucket.months.get(month) ?? 0n,
          `income from ${bucket.client.name} in ${month}`
        ),
        (incomeMinor) => ({ incomeMinor, month })
      )
    );

    return series;
  });

const shareTargetsOf = (
  buckets: readonly ClientBucket[]
): Effect.Effect<readonly ShareTarget[], ReportOverflow> =>
  Effect.gen(function* clientShares() {
    const targets: ShareTarget[] = [];

    for (const bucket of buckets) {
      targets.push({
        key: bucket.client.payeeId,
        minor: yield* minorOrOverflow(
          bucket.total,
          `income from ${bucket.client.name}`
        ),
      });
    }

    return targets;
  });

export const incomeRowsOf = (
  flows: readonly Flow[],
  payees: ReadonlyMap<string, string>,
  months: readonly YearMonth[],
  client: Option.Option<PayeeId>
): Effect.Effect<readonly ClientIncome[], UnknownClient | ReportOverflow> =>
  Effect.gen(function* incomeRows() {
    if (Option.isSome(client) && !payees.has(client.value)) {
      return yield* unknownClientOf(client.value);
    }

    for (const clientId of clientIdsOf(flows)) {
      if (!payees.has(clientId)) {
        return yield* unknownClientOf(clientId);
      }
    }

    const buckets = [...bucketsOf(flows, payees, client).values()].toSorted(
      (left, right) => {
        if (left.total !== right.total) {
          return left.total > right.total ? -1 : 1;
        }

        return compareText(left.client.name, right.client.name);
      }
    );

    const shares = yield* allocateShares(yield* shareTargetsOf(buckets));

    const sharesByClient = new Map(
      shares.map((share) => [share.key, share.shareBasisPoints])
    );

    const rows: ClientIncome[] = [];

    for (const bucket of buckets) {
      rows.push({
        client: bucket.client,
        incomeMinor: yield* minorOrOverflow(
          bucket.total,
          `income from ${bucket.client.name}`
        ),
        months: yield* seriesOf(bucket, months),
        shareBasisPoints:
          sharesByClient.get(bucket.client.payeeId) ?? zeroShare,
      });
    }

    return rows;
  });
