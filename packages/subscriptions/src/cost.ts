import { Option, Predicate, Result, Schema } from "effect";

import { BaseCurrencyMismatch } from "./base-currency-mismatch.js";
import { MinorUnitsSchema, MoneySchema } from "./model.js";
import type {
  CurrencyCode,
  Frequency,
  MinorUnits,
  Money,
  Payment,
  Subscription,
  SubscriptionCost,
  SubscriptionEntry,
  SubscriptionFilter,
  SubscriptionPage,
  SubscriptionView,
} from "./model.js";
import { chargesPerYearOf } from "./schedule.js";
import { isActiveStatus } from "./status.js";
import { SubscriptionCostOverflow } from "./subscription-cost-overflow.js";

const money = Schema.decodeSync(MoneySchema);

const minorUnits = Schema.decodeSync(MinorUnitsSchema);

const overflow = (
  operation: "annual" | "monthly" | "total",
  message: string
): SubscriptionCostOverflow =>
  new SubscriptionCostOverflow({
    message,
    operation,
    repair:
      "Store a typical charge whose costs stay inside the range an integer minor unit holds, then call `listSubscriptions` again.",
  });

const safeMinor = (total: bigint): Option.Option<MinorUnits> => {
  const asNumber = Number(total);

  return Number.isSafeInteger(asNumber)
    ? Option.some(minorUnits(asNumber))
    : Option.none();
};

export const annualOf = (
  amount: Payment,
  frequency: Frequency
): Result.Result<Money, SubscriptionCostOverflow> => {
  const total = BigInt(amount.minor) * BigInt(chargesPerYearOf(frequency));

  return Option.match(safeMinor(total), {
    onNone: () =>
      Result.fail(
        overflow(
          "annual",
          `A typical charge of ${amount.minor} ${amount.currency} taken ${chargesPerYearOf(frequency)} times a year is larger than an integer minor unit holds.`
        )
      ),
    onSome: (minor) =>
      Result.succeed(money({ currency: amount.currency, minor })),
  });
};

export const monthlyOf = (
  annual: Money
): Result.Result<Money, SubscriptionCostOverflow> =>
  Option.match(safeMinor(BigInt(annual.minor) / 12n), {
    onNone: () =>
      Result.fail(
        overflow(
          "monthly",
          `An annual cost of ${annual.minor} ${annual.currency} does not divide into an integer minor unit.`
        )
      ),
    onSome: (minor) =>
      Result.succeed(money({ currency: annual.currency, minor })),
  });

export const costOf = (
  subscription: Subscription
): Result.Result<SubscriptionCost, SubscriptionCostOverflow> =>
  Result.flatMap(
    annualOf(subscription.baseAmount, subscription.frequency),
    (annual) =>
      Result.map(monthlyOf(annual), (monthly) => ({ annual, monthly }))
  );

export const viewOf = (
  entry: SubscriptionEntry,
  baseCurrency: CurrencyCode
): Result.Result<
  SubscriptionView,
  SubscriptionCostOverflow | BaseCurrencyMismatch
> => {
  const { subscription } = entry;

  if (subscription.baseAmount.currency !== baseCurrency) {
    return Result.fail(
      new BaseCurrencyMismatch({
        baseCurrency,
        currency: subscription.baseAmount.currency,
        message: `Repeat payment ${subscription.id} holds its base cost in ${subscription.baseAmount.currency} while profile ${subscription.profileId} keeps its base currency in ${baseCurrency}.`,
        repair:
          "Re-store the repeat payment's base cost in the profile's base currency, then read the list again.",
      })
    );
  }

  return Result.map(costOf(subscription), (cost): SubscriptionView => ({
    categoryId: subscription.categoryId,
    confidence: subscription.confidence,
    cost,
    frequency: subscription.frequency,
    id: subscription.id,
    lastChargedOn: subscription.lastChargedOn,
    nextCharge: isActiveStatus(subscription.status)
      ? Option.some(subscription.nextExpectedOn)
      : Option.none(),
    occurrenceCount: subscription.occurrenceCount,
    payeeId: subscription.payeeId,
    payeeName: entry.payeeName,
    status: subscription.status,
  }));
};

const collect = (
  entries: readonly SubscriptionEntry[],
  baseCurrency: CurrencyCode
): Result.Result<
  readonly SubscriptionView[],
  SubscriptionCostOverflow | BaseCurrencyMismatch
> => {
  const collected: SubscriptionView[] = [];

  for (const entry of entries) {
    const view = viewOf(entry, baseCurrency);

    if (Result.isFailure(view)) {
      return Result.fail(view.failure);
    }

    collected.push(view.success);
  }

  return Result.succeed(collected);
};

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const newestFirst = (
  left: SubscriptionView,
  right: SubscriptionView
): number => {
  if (left.lastChargedOn !== right.lastChargedOn) {
    return left.lastChargedOn > right.lastChargedOn ? -1 : 1;
  }

  return compareText(left.id, right.id);
};

const totalOf = (
  entries: readonly SubscriptionEntry[],
  baseCurrency: CurrencyCode
): Result.Result<
  { readonly annual: Money; readonly monthly: Money },
  SubscriptionCostOverflow
> => {
  let annualTotal = 0n;
  let monthlyTotal = 0n;

  for (const entry of entries) {
    const cost = costOf(entry.subscription);

    if (Result.isFailure(cost)) {
      return Result.fail(cost.failure);
    }

    annualTotal += BigInt(cost.success.annual.minor);
    monthlyTotal += BigInt(cost.success.monthly.minor);
  }

  const annual = safeMinor(annualTotal);
  const monthly = safeMinor(monthlyTotal);

  if (Option.isNone(annual) || Option.isNone(monthly)) {
    return Result.fail(
      overflow(
        "total",
        `The active repeat payments of profile ${baseCurrency} add up past the range an integer minor unit holds.`
      )
    );
  }

  return Result.succeed({
    annual: money({ currency: baseCurrency, minor: annual.value }),
    monthly: money({ currency: baseCurrency, minor: monthly.value }),
  });
};

const keeps = (filter: SubscriptionFilter, entry: SubscriptionEntry): boolean =>
  Predicate.isTagged(filter, "All")
    ? true
    : isActiveStatus(entry.subscription.status);

export const pageOf = (
  entries: readonly SubscriptionEntry[],
  filter: SubscriptionFilter,
  baseCurrency: CurrencyCode
): Result.Result<
  SubscriptionPage,
  SubscriptionCostOverflow | BaseCurrencyMismatch
> =>
  Result.gen(function* pageOfEntries() {
    const activeEntries = entries.filter((entry) =>
      isActiveStatus(entry.subscription.status)
    );

    const views = yield* collect(
      entries.filter((entry) => keeps(filter, entry)),
      baseCurrency
    );

    const total = yield* totalOf(activeEntries, baseCurrency);

    return {
      activeAnnual: total.annual,
      activeMonthly: total.monthly,
      baseCurrency,
      subscriptions: [...views].toSorted(newestFirst),
    };
  });
