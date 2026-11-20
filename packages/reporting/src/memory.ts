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

export interface MemoryReportBook {
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

export interface MemoryReportSeed {
  readonly books: readonly MemoryReportBook[];
  readonly emptyBaseCurrency: CurrencyCode;
  readonly emptyToday: DateOnly;
}

const emptyBookOf = (
  seed: MemoryReportSeed,
  profileId: ProfileId
): MemoryReportBook => ({
  accounts: [],
  baseCurrency: seed.emptyBaseCurrency,
  categories: [],
  obligations: [],
  payees: [],
  profileId,
  rates: [],
  today: seed.emptyToday,
  transactions: [],
});

export const memoryReportSourceLayer = (seed: MemoryReportSeed) => {
  const books = new Map<ProfileId, MemoryReportBook>(
    seed.books.map((book) => [book.profileId, book])
  );

  const bookOf = (profileId: ProfileId): MemoryReportBook =>
    books.get(profileId) ?? emptyBookOf(seed, profileId);

  return Layer.succeed(ReportSource, {
    accounts: (profileId) => Effect.succeed(bookOf(profileId).accounts),
    baseCurrency: (profileId) => Effect.succeed(bookOf(profileId).baseCurrency),
    categories: (profileId) => Effect.succeed(bookOf(profileId).categories),
    obligations: (profileId) => Effect.succeed(bookOf(profileId).obligations),
    payees: (profileId) => Effect.succeed(bookOf(profileId).payees),
    rates: (profileId) => (query) =>
      Option.fromNullishOr(
        bookOf(profileId).rates.find(
          (rate) => rate.from === query.from && rate.to === query.to
        )?.rate
      ),
    today: (profileId) => Effect.succeed(bookOf(profileId).today),
    transactions: (profileId) => Effect.succeed(bookOf(profileId).transactions),
  });
};
