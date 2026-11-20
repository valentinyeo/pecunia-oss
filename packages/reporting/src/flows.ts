import type {
  Amounts,
  Categorization,
  Classification,
  Transaction,
} from "@pecunia/core/model";
import { sourceAmount } from "@pecunia/core/model";
import { Effect, Match, Option, Schema } from "effect";

import { daysBetween, monthOfDate, withinBound } from "./date.js";
import { mixedCurrencyOf } from "./errors.js";
import type { MixedCurrency, ReportOverflow } from "./errors.js";
import type {
  Bound,
  CategoryId,
  CategoryReference,
  CurrencyCode,
  CurrencySpend,
  DailySpend,
  DateOnly,
  Money,
  MonthTotals,
  Payment,
  Totals,
  YearMonth,
} from "./model.js";
import {
  CategoryReferenceSchema,
  MonthTotalsSchema,
  TotalsSchema,
} from "./model.js";
import { compareText, minorOrOverflow, moneyOf } from "./money.js";

export const FlowKindSchema = Schema.Literals([
  "ignored",
  "income",
  "otherIn",
  "refund",
  "spend",
  "tax",
]);

export type FlowKind = typeof FlowKindSchema.Type;

export interface Flow {
  readonly amount: Money;
  readonly kind: FlowKind;
  readonly source: Money;
  readonly transaction: Transaction;
}

export const baseOf = (amounts: Amounts): Money =>
  Match.value(amounts).pipe(
    Match.tag("Converted", ({ base }) => moneyOf(base.currency, base.minor)),
    Match.tag("SameCurrency", ({ amount }) => amount),
    Match.exhaustive
  );

const ignoredClassification = (classification: Classification): boolean =>
  Match.value(classification).pipe(
    Match.tag("Excluded", () => true),
    Match.tag("InternalTransfer", () => true),
    Match.tag("SelfTransfer", () => true),
    Match.orElse(() => false)
  );

const incomingKind = (classification: Classification): FlowKind =>
  Match.value(classification).pipe(
    Match.tag("Income", (): FlowKind => "income"),
    Match.tag("Refund", (): FlowKind => "refund"),
    Match.orElse((): FlowKind => "otherIn")
  );

const outgoingKind = (classification: Classification): FlowKind =>
  Match.value(classification).pipe(
    Match.tag("TaxPayment", (): FlowKind => "tax"),
    Match.orElse((): FlowKind => "spend")
  );

export const flowKindOf = (transaction: Transaction): FlowKind => {
  if (transaction.status !== "posted") {
    return "ignored";
  }

  if (ignoredClassification(transaction.classification)) {
    return "ignored";
  }

  return Match.value(transaction.direction).pipe(
    Match.when("neutral", (): FlowKind => "ignored"),
    Match.when("in", () => incomingKind(transaction.classification)),
    Match.when("out", () => outgoingKind(transaction.classification)),
    Match.exhaustive
  );
};

export const merchantOf = (transaction: Transaction): string =>
  transaction.raw.merchant.trim() === ""
    ? transaction.raw.description
    : transaction.raw.merchant;

const flowOf = (
  transaction: Transaction,
  currency: CurrencyCode
): Effect.Effect<Flow, MixedCurrency> => {
  const amount = baseOf(transaction.amounts);

  return amount.currency === currency
    ? Effect.succeed({
        amount,
        kind: flowKindOf(transaction),
        source: sourceAmount(transaction.amounts),
        transaction,
      })
    : Effect.fail(mixedCurrencyOf(currency, amount.currency));
};

export const flowsOf = (
  transactions: readonly Transaction[],
  currency: CurrencyCode
): Effect.Effect<readonly Flow[], MixedCurrency> =>
  Effect.gen(function* flowsOfBook() {
    const flows = yield* Effect.forEach([...transactions], (transaction) =>
      flowOf(transaction, currency)
    );

    return flows;
  });

export const countedFlows = (flows: readonly Flow[]): readonly Flow[] =>
  flows.filter((flow) => flow.kind !== "ignored");

export const flowsIn = (
  flows: readonly Flow[],
  bound: Bound
): readonly Flow[] =>
  countedFlows(flows).filter((flow) =>
    withinBound(bound, flow.transaction.valueDate)
  );

const sumByKind = (flows: readonly Flow[]): ReadonlyMap<FlowKind, bigint> => {
  const sums = new Map<FlowKind, bigint>();

  for (const flow of flows) {
    sums.set(
      flow.kind,
      (sums.get(flow.kind) ?? 0n) + BigInt(flow.amount.minor)
    );
  }

  return sums;
};

export const totalsOf = (
  flows: readonly Flow[],
  currency: CurrencyCode
): Effect.Effect<Totals, ReportOverflow> =>
  Effect.gen(function* totalsOfBook() {
    const sums = sumByKind(flows);
    const of = (kind: FlowKind): bigint => sums.get(kind) ?? 0n;
    const moneyIn = of("income") + of("otherIn") + of("refund");
    const moneyOut = of("spend") + of("tax");
    const incomeMinor = yield* minorOrOverflow(of("income"), "income");
    const otherInMinor = yield* minorOrOverflow(of("otherIn"), "other income");
    const refundMinor = yield* minorOrOverflow(of("refund"), "refunds");
    const spendMinor = yield* minorOrOverflow(of("spend"), "spend");
    const taxMinor = yield* minorOrOverflow(of("tax"), "tax");
    const moneyInMinor = yield* minorOrOverflow(moneyIn, "money in");
    const moneyOutMinor = yield* minorOrOverflow(moneyOut, "money out");
    const netMinor = yield* minorOrOverflow(moneyIn - moneyOut, "net");

    const candidate = {
      currency,
      incomeMinor,
      moneyInMinor,
      moneyOutMinor,
      netMinor,
      otherInMinor,
      refundMinor,
      spendMinor,
      taxMinor,
    };

    return yield* Schema.decodeEffect(TotalsSchema)(candidate).pipe(
      Effect.orDie
    );
  });

export const spendFlows = (flows: readonly Flow[]): readonly Flow[] =>
  flows.filter((flow) => flow.kind === "spend");

const byCurrency = (
  [leftCurrency]: readonly [CurrencyCode, bigint],
  [rightCurrency]: readonly [CurrencyCode, bigint]
): number => compareText(leftCurrency, rightCurrency);

export const spendByCurrency = (
  flows: readonly Flow[]
): Effect.Effect<readonly CurrencySpend[], ReportOverflow> => {
  const sums = new Map<CurrencyCode, bigint>();

  for (const flow of spendFlows(flows)) {
    sums.set(
      flow.source.currency,
      (sums.get(flow.source.currency) ?? 0n) + BigInt(flow.source.minor)
    );
  }

  return Effect.gen(function* spendByCurrencyOfBook() {
    const rows = yield* Effect.forEach(
      [...sums.entries()].toSorted(byCurrency),
      ([currency, minor]) =>
        Effect.map(minorOrOverflow(minor, `spend in ${currency}`), (spend) => ({
          currency,
          spendMinor: spend,
        }))
    );

    return rows;
  });
};

export const dailySpend = (
  flows: readonly Flow[],
  from: DateOnly,
  to: DateOnly
): Effect.Effect<readonly DailySpend[], ReportOverflow> => {
  const sums = new Map<DateOnly, bigint>();

  for (const flow of spendFlows(flows)) {
    const date = flow.transaction.valueDate;

    if (from <= date && date <= to) {
      sums.set(date, (sums.get(date) ?? 0n) + BigInt(flow.amount.minor));
    }
  }

  return Effect.gen(function* dailySpendOfBook() {
    const days = yield* Effect.forEach([...daysBetween(from, to)], (date) =>
      Effect.map(
        minorOrOverflow(sums.get(date) ?? 0n, `spend on ${date}`),
        (spend) => ({ date, spendMinor: spend })
      )
    );

    return days;
  });
};

export const spanOf = (
  flows: readonly Flow[]
): Option.Option<{ readonly from: DateOnly; readonly to: DateOnly }> => {
  let from: Option.Option<DateOnly> = Option.none();
  let to: Option.Option<DateOnly> = Option.none();

  for (const flow of countedFlows(flows)) {
    const date = flow.transaction.valueDate;
    from = Option.match(from, {
      onNone: () => Option.some(date),
      onSome: (current) => Option.some(current <= date ? current : date),
    });
    to = Option.match(to, {
      onNone: () => Option.some(date),
      onSome: (current) => Option.some(current >= date ? current : date),
    });
  }

  return Option.zipWith(from, to, (first, last) => ({
    from: first,
    to: last,
  }));
};

export const categoryReferenceOf = (
  categorization: Categorization,
  names: ReadonlyMap<string, string>
): CategoryReference => {
  const reference = (categoryId: CategoryId): CategoryReference => {
    const name = names.get(categoryId);

    return name === undefined
      ? CategoryReferenceSchema.cases.Uncategorised.make({})
      : CategoryReferenceSchema.cases.Categorised.make({ categoryId, name });
  };

  return Match.value(categorization).pipe(
    Match.tag("Applied", ({ categoryId }) => reference(categoryId)),
    Match.tag("Confirmed", ({ categoryId }) => reference(categoryId)),
    Match.tag("Suggested", ({ categoryId }) => reference(categoryId)),
    Match.tag("None", () =>
      CategoryReferenceSchema.cases.Uncategorised.make({})
    ),
    Match.exhaustive
  );
};

const payeeLabelOf = (
  flow: Flow,
  payees: ReadonlyMap<string, string>
): Option.Option<string> =>
  Option.isNone(flow.transaction.payeeId)
    ? Option.none()
    : Option.fromNullishOr(payees.get(flow.transaction.payeeId.value));

export const paymentOf = (
  flow: Flow,
  names: ReadonlyMap<string, string>,
  payees: ReadonlyMap<string, string>
): Payment => ({
  amount: flow.amount,
  category: categoryReferenceOf(flow.transaction.categorization, names),
  direction: flow.transaction.direction,
  id: flow.transaction.id,
  merchant: merchantOf(flow.transaction),
  occurredAt: flow.transaction.occurredAt,
  payeeName: payeeLabelOf(flow, payees),
  reference: flow.transaction.raw.reference,
});

const newestFirst = (left: Flow, right: Flow): number => {
  const occurred = compareText(
    right.transaction.occurredAt,
    left.transaction.occurredAt
  );

  return occurred === 0
    ? compareText(left.transaction.id, right.transaction.id)
    : occurred;
};

export const paymentsOf = (
  flows: readonly Flow[],
  names: ReadonlyMap<string, string>,
  payees: ReadonlyMap<string, string>
): readonly Payment[] =>
  flows.toSorted(newestFirst).map((flow) => paymentOf(flow, names, payees));

export const monthOfValueDate = (flow: Flow): YearMonth =>
  monthOfDate(flow.transaction.valueDate);

export const monthsHeld = (flows: readonly Flow[]): readonly YearMonth[] => {
  const months = new Set<YearMonth>();

  for (const flow of countedFlows(flows)) {
    months.add(monthOfValueDate(flow));
  }

  return [...months].toSorted((left, right) => compareText(right, left));
};

export const monthTotalsOf = (
  flows: readonly Flow[],
  currency: CurrencyCode,
  months: readonly YearMonth[]
): Effect.Effect<readonly MonthTotals[], ReportOverflow> =>
  Effect.forEach([...months], (month) =>
    Effect.map(
      totalsOf(
        countedFlows(flows).filter((flow) => monthOfValueDate(flow) === month),
        currency
      ),
      (totals) => Schema.decodeSync(MonthTotalsSchema)({ month, totals })
    )
  );
