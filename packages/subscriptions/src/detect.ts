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
  const middle = ordered[Math.floor((ordered.length - 1) / 2)];

  if (middle === undefined) {
    throw new Error(
      "A median needs at least one value. Fix: call `medianOf` only with the charges of one payee."
    );
  }

  return middle;
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

const dominantCurrency = (charges: readonly Charge[]): CurrencyCode => {
  const counts = new Map<CurrencyCode, number>();

  for (const charge of charges) {
    counts.set(
      charge.amount.currency,
      (counts.get(charge.amount.currency) ?? 0) + 1
    );
  }

  const ranked = [...counts.entries()].toSorted(
    ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
      rightCount - leftCount || (leftCurrency < rightCurrency ? -1 : 1)
  );

  const [top] = ranked;

  if (top === undefined) {
    throw new Error(
      "A payee needs one charge to pick its currency. Fix: call this only with a non-empty charge list."
    );
  }

  return top[0];
};

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

  const template = inCurrency.at(0);

  if (template === undefined) {
    return Option.none();
  }

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
      currency: template.baseAmount.currency,
      minor: medianOf(inCurrency.map((charge) => charge.baseAmount.minor)),
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
