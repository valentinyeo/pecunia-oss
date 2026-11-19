import type { Money, RateLookup, TaxObligation } from "@pecunia/core/model";
import { convertMinor } from "@pecunia/core/model";
import { Effect, Match, Option, Result } from "effect";

import { amountNotRepresentableOf, rateMissingOf } from "./errors.js";
import type {
  AmountNotRepresentable,
  RateMissing,
  ReportOverflow,
} from "./errors.js";
import type {
  AccountBalance,
  BalanceRow,
  CurrencyCode,
  TotalBalance,
} from "./model.js";
import { compareText, minorOrOverflow, moneyOf } from "./money.js";

export type BalanceFailure =
  | AmountNotRepresentable
  | RateMissing
  | ReportOverflow;

const convertedOf = (
  amount: Money,
  currency: CurrencyCode,
  rates: RateLookup
): Effect.Effect<Money, BalanceFailure> => {
  if (amount.currency === currency) {
    return Effect.succeed(amount);
  }

  return Option.match(rates({ from: amount.currency, to: currency }), {
    onNone: () => Effect.fail(rateMissingOf(amount.currency, currency)),
    onSome: (rate) =>
      Effect.fromResult(
        convertMinor(amount.minor, amount.currency, currency, rate).pipe(
          Result.mapError((failure) =>
            amountNotRepresentableOf(failure.message)
          ),
          Result.map((minor) => moneyOf(currency, minor))
        )
      ),
  });
};

export const totalBalanceOf = (
  accounts: readonly AccountBalance[],
  currency: CurrencyCode,
  rates: RateLookup
): Effect.Effect<TotalBalance, BalanceFailure> =>
  Effect.gen(function* totalBalance() {
    const rows: BalanceRow[] = [];
    let total = 0n;

    for (const account of accounts) {
      const amount = yield* convertedOf(account.balance, currency, rates);

      rows.push({
        accountId: account.accountId,
        amount,
        kind: account.kind,
        name: account.name,
      });
      total += BigInt(amount.minor);
    }

    rows.sort((left, right) => compareText(left.name, right.name));

    return {
      accounts: rows,
      currency,
      totalMinor: yield* minorOrOverflow(total, "total balance"),
    };
  });

const estimated = (obligation: TaxObligation): boolean =>
  Match.value(obligation.status).pipe(
    Match.tag("Estimated", () => true),
    Match.orElse(() => false)
  );

export const taxOwedOf = (
  obligations: readonly TaxObligation[],
  currency: CurrencyCode,
  rates: RateLookup
): Effect.Effect<Money, BalanceFailure> =>
  Effect.gen(function* taxOwed() {
    let total = 0n;

    for (const obligation of obligations) {
      if (estimated(obligation)) {
        const amount = yield* convertedOf(obligation.amount, currency, rates);

        total += BigInt(amount.minor);
      }
    }

    return moneyOf(currency, yield* minorOrOverflow(total, "tax still owed"));
  });
