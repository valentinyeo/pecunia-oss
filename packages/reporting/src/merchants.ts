import { Effect } from "effect";

import type { ReportOverflow } from "./errors.js";
import type { Flow } from "./flows.js";
import { merchantOf, spendFlows } from "./flows.js";
import type { MerchantSpend, RepeatPayment } from "./model.js";
import { compareText, minorOrOverflow } from "./money.js";

export const TOP_MERCHANT_LIMIT = 5;

interface MerchantBucket {
  readonly merchant: string;
  readonly payments: number;
  readonly spend: bigint;
}

const bucketsOf = (flows: readonly Flow[]): MerchantBucket[] => {
  const buckets = new Map<string, MerchantBucket>();

  for (const flow of spendFlows(flows)) {
    const merchant = merchantOf(flow.transaction);

    const current = buckets.get(merchant) ?? {
      merchant,
      payments: 0,
      spend: 0n,
    };

    buckets.set(merchant, {
      merchant,
      payments: current.payments + 1,
      spend: current.spend + BigInt(flow.amount.minor),
    });
  }

  return [...buckets.values()];
};

const bySpendThenName = (
  left: MerchantBucket,
  right: MerchantBucket
): number => {
  if (left.spend !== right.spend) {
    return left.spend > right.spend ? -1 : 1;
  }

  return compareText(left.merchant, right.merchant);
};

export const merchantRowsOf = (
  flows: readonly Flow[],
  limit: number
): Effect.Effect<readonly MerchantSpend[], ReportOverflow> =>
  Effect.forEach(
    bucketsOf(flows).toSorted(bySpendThenName).slice(0, limit),
    (bucket) =>
      Effect.map(
        minorOrOverflow(bucket.spend, `spend at ${bucket.merchant}`),
        (spendMinor) => ({
          merchant: bucket.merchant,
          repeatCount: bucket.payments,
          spendMinor,
        })
      )
  );

export const repeatPaymentsOf = (
  flows: readonly Flow[],
  limit: number
): Effect.Effect<readonly RepeatPayment[], ReportOverflow> =>
  Effect.forEach(
    bucketsOf(flows)
      .filter((bucket) => bucket.payments >= 2)
      .toSorted((left, right) =>
        left.payments === right.payments
          ? bySpendThenName(left, right)
          : right.payments - left.payments
      )
      .slice(0, limit),
    (bucket) =>
      Effect.map(
        minorOrOverflow(
          bucket.spend,
          `repeated payments to ${bucket.merchant}`
        ),
        (spendMinor) => ({
          merchant: bucket.merchant,
          payments: bucket.payments,
          spendMinor,
        })
      )
  );
