import type {
  Category,
  Payee,
  Rate,
  TaxObligation,
  Transaction,
} from "@pecunia/core/model";
import { Effect, Layer, Option } from "effect";

import type {
  AccountBalance,
  CurrencyCode,
  DateOnly,
  ProfileId,
} from "./model.js";
import { ReportSource } from "./source.js";

export interface MemoryRate {
  readonly from: CurrencyCode;
  readonly rate: Rate;
  readonly to: CurrencyCode;
}

export interface MemoryReportSeed {
  readonly accounts: readonly AccountBalance[];
  readonly baseCurrency: CurrencyCode;
  readonly categories: readonly Category[];
  readonly obligations: readonly TaxObligation[];
  readonly payees: readonly Payee[];
  readonly profileId: ProfileId;
  readonly rates: readonly MemoryRate[];
  readonly today: DateOnly;
  readonly transactions: readonly Transaction[];
}

export const memoryReportSourceLayer = (seed: MemoryReportSeed) =>
  Layer.succeed(ReportSource, {
    accounts: () => Effect.succeed(seed.accounts),
    baseCurrency: () => Effect.succeed(seed.baseCurrency),
    categories: () => Effect.succeed(seed.categories),
    obligations: () => Effect.succeed(seed.obligations),
    payees: () => Effect.succeed(seed.payees),
    rates: () => (query) =>
      Option.fromNullishOr(
        seed.rates.find(
          (rate) => rate.from === query.from && rate.to === query.to
        )?.rate
      ),
    today: () => Effect.succeed(seed.today),
    transactions: () => Effect.succeed(seed.transactions),
  });
