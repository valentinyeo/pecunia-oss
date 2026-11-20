import type { Minor } from "../money.js";

export const BASIS_POINTS = 10_000;

export type BasisPoints = number;

const SCALE = BigInt(BASIS_POINTS);

interface Remainder {
  readonly index: number;
  readonly remainder: bigint;
}

export const sharesOf = (amounts: readonly Minor[]): readonly BasisPoints[] => {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);

  if (total <= 0) {
    return amounts.map(() => 0);
  }

  const scaled = amounts.map((amount) => BigInt(amount) * SCALE);
  const denominator = BigInt(total);

  const shares = scaled.map((value) => Number(value / denominator));
  const left = BASIS_POINTS - shares.reduce((sum, share) => sum + share, 0);

  const byRemainder: readonly Remainder[] = scaled
    .map((value, index) => ({ index, remainder: value % denominator }))
    .toSorted((left_, right) => {
      if (left_.remainder === right.remainder) {
        return left_.index - right.index;
      }

      return left_.remainder > right.remainder ? -1 : 1;
    })
    .slice(0, left);

  return shares.map((share, index) =>
    byRemainder.some((row) => row.index === index) ? share + 1 : share
  );
};

export const percentOf = (share: BasisPoints): string =>
  `${(share / 100).toFixed(1)}%`;
