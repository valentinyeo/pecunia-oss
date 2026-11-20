import { Option, Schema } from "effect";

import { dayNumberOf, daysBetween } from "./civil.js";
import { PaymentSchema } from "./model.js";
import type {
  Charge,
  CurrencyCode,
  DetectedRepeatPayment,
  Payee,
} from "./model.js";
import { frequencyOfInterval, NOMINAL_DAYS, nextChargeOn } from "./schedule.js";

export const MIN_OCCURRENCES = 3;

const payment = Schema.decodeSync(PaymentSchema);

const medianOf = (values: readonly number[]): number => {
  const ordered = [...values].toSorted((left, right) => left - right);
  const lower = ordered[Math.floor((ordered.length - 1) / 2)];

  if (lower === undefined) {
    throw new Error(
      "A median needs at least one value. Fix: call `medianOf` only with the charges of one payee."
    );
  }

  if (ordered.length % 2 === 1) {
    return lower;
  }

  const upper = ordered[Math.floor(ordered.length / 2)];

  if (upper === undefined) {
    throw new Error(
      "A median needs both of its middle values. Fix: call `medianOf` only with a non-empty list."
    );
  }

  return lower + Math.floor((upper - lower) / 2);
};

const orderedByDate = (charges: readonly Charge[]): readonly Charge[] =>
  [...charges].toSorted(
    (left, right) => dayNumberOf(left.on) - dayNumberOf(right.on)
  );

const intervalsOf = (charges: readonly Charge[]): readonly number[] =>
  charges.flatMap((charge, index) => {
    const previous = charges[index - 1];

    return previous === undefined ? [] : [daysBetween(previous.on, charge.on)];
  });

interface CurrencyTally {
  readonly count: number;
  readonly first: number;
}

const tallyOf = (
  charges: readonly Charge[],
  currencyOf: (charge: Charge) => CurrencyCode
): ReadonlyMap<CurrencyCode, CurrencyTally> => {
  const tallies = new Map<CurrencyCode, CurrencyTally>();

  for (const [index, charge] of charges.entries()) {
    const code = currencyOf(charge);
    const tally = tallies.get(code);

    tallies.set(code, {
      count: (tally?.count ?? 0) + 1,
      first: tally?.first ?? index,
    });
  }

  return tallies;
};

type TallyEntry = readonly [CurrencyCode, CurrencyTally];

const mostUsed = (
  tallies: ReadonlyMap<CurrencyCode, CurrencyTally>,
  compareTies: (left: TallyEntry, right: TallyEntry) => number
): CurrencyCode => {
  const ranked = [...tallies.entries()].toSorted(
    (left, right) => right[1].count - left[1].count || compareTies(left, right)
  );

  const [top] = ranked;

  if (top === undefined) {
    throw new Error(
      "A payee needs one charge to pick its currency. Fix: call this only with a non-empty charge list."
    );
  }

  return top[0];
};

const dominantCurrency = (charges: readonly Charge[]): CurrencyCode =>
  mostUsed(
    tallyOf(charges, (charge) => charge.amount.currency),
    ([leftCurrency], [rightCurrency]) => (leftCurrency < rightCurrency ? -1 : 1)
  );

const dominantBaseCurrency = (charges: readonly Charge[]): CurrencyCode =>
  mostUsed(
    tallyOf(charges, (charge) => charge.baseAmount.currency),
    ([, left], [, right]) => left.first - right.first
  );

const candidateOf = (
  charges: readonly Charge[],
  payee: Payee
): Option.Option<DetectedRepeatPayment> => {
  const ordered = orderedByDate(charges);
  const last = ordered.at(-1);

  if (ordered.length < MIN_OCCURRENCES || last === undefined) {
    return Option.none();
  }

  const intervals = intervalsOf(ordered);
  const frequency = frequencyOfInterval(medianOf(intervals));

  if (frequency === undefined) {
    return Option.none();
  }

  const currency = dominantCurrency(ordered);

  const inCurrency = ordered.filter(
    (charge) => charge.amount.currency === currency
  );

  if (inCurrency.length === 0) {
    return Option.none();
  }

  const baseCurrency = dominantBaseCurrency(inCurrency);

  const inBaseCurrency = inCurrency.filter(
    (charge) => charge.baseAmount.currency === baseCurrency
  );

  const nominal = NOMINAL_DAYS[frequency];

  const worst = Math.max(
    ...intervals.map((interval) => Math.abs(interval - nominal))
  );

  return Option.some({
    confidence: Math.max(0, 1 - worst / nominal),
    frequency,
    lastChargedOn: last.on,
    nextExpectedOn: nextChargeOn(last.on, frequency),
    occurrenceCount: ordered.length,
    payeeId: payee.id,
    payeeName: payee.name,
    typicalAmount: payment({
      currency,
      minor: medianOf(inCurrency.map((charge) => charge.amount.minor)),
    }),
    typicalBaseAmount: payment({
      currency: baseCurrency,
      minor: medianOf(inBaseCurrency.map((charge) => charge.baseAmount.minor)),
    }),
  });
};

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const newestFirst = (
  left: DetectedRepeatPayment,
  right: DetectedRepeatPayment
): number => {
  if (left.lastChargedOn !== right.lastChargedOn) {
    return left.lastChargedOn > right.lastChargedOn ? -1 : 1;
  }

  return compareText(left.payeeId, right.payeeId);
};

export const detectRepeatPayments = (
  charges: readonly Charge[],
  payees: readonly Payee[]
): readonly DetectedRepeatPayment[] => {
  const byPayee = new Map<string, Charge[]>();

  for (const charge of charges) {
    if (charge.direction === "out") {
      byPayee.set(charge.payeeId, [
        ...(byPayee.get(charge.payeeId) ?? []),
        charge,
      ]);
    }
  }

  const found: DetectedRepeatPayment[] = [];

  for (const [payeeId, group] of byPayee) {
    const payee = payees.find((candidate) => candidate.id === payeeId);

    const candidate =
      payee === undefined ? Option.none() : candidateOf(group, payee);

    if (Option.isSome(candidate)) {
      found.push(candidate.value);
    }
  }

  return found.toSorted(newestFirst);
};
