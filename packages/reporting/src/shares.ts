import { Effect, Option } from "effect";

import type { ReportOverflow } from "./errors.js";
import { overflowOf } from "./errors.js";
import type { MinorUnits, ShareBasisPoints } from "./model.js";
import { compareText, shareOf, zeroShare } from "./money.js";

export interface ShareTarget {
  readonly key: string;
  readonly minor: MinorUnits;
}

export interface Share {
  readonly key: string;
  readonly shareBasisPoints: ShareBasisPoints;
}

const hundredPercent = 10_000n;

const absolute = (value: bigint): bigint => (value < 0n ? -value : value);

interface Quota {
  readonly key: string;
  readonly minor: bigint;
  readonly quotient: bigint;
  readonly remainder: bigint;
}

const quotaOf = (target: ShareTarget, total: bigint): Quota => {
  const scaled = BigInt(target.minor) * hundredPercent;
  const quotient = scaled / total;

  return {
    key: target.key,
    minor: BigInt(target.minor),
    quotient,
    remainder: scaled - quotient * total,
  };
};

const byLargestRemainder = (left: Quota, right: Quota): number => {
  const remainder = absolute(right.remainder) - absolute(left.remainder);

  if (remainder !== 0n) {
    return remainder > 0n ? 1 : -1;
  }

  const minor = absolute(right.minor) - absolute(left.minor);

  if (minor !== 0n) {
    return minor > 0n ? 1 : -1;
  }

  return compareText(left.key, right.key);
};

const totalOf = (targets: readonly ShareTarget[]): bigint => {
  let total = 0n;

  for (const target of targets) {
    total += BigInt(target.minor);
  }

  return total;
};

export const allocateShares = (
  targets: readonly ShareTarget[]
): Effect.Effect<readonly Share[], ReportOverflow> => {
  const total = totalOf(targets);

  if (total === 0n) {
    return Effect.succeed(
      targets.map((target) => ({
        key: target.key,
        shareBasisPoints: zeroShare,
      }))
    );
  }

  const quotas = targets.map((target) => quotaOf(target, total));
  let used = 0n;

  for (const quota of quotas) {
    used += quota.quotient;
  }

  const leftover = hundredPercent - used;
  const step = leftover < 0n ? -1n : 1n;
  const ordered = [...quotas].toSorted(byLargestRemainder);

  const shares = new Map<string, bigint>(
    quotas.map((quota) => [quota.key, quota.quotient])
  );

  for (let index = 0; index < Number(absolute(leftover)); index += 1) {
    const quota = ordered[index % ordered.length];

    if (quota === undefined) {
      return Effect.fail(overflowOf("the share of a total"));
    }

    shares.set(quota.key, (shares.get(quota.key) ?? 0n) + step);
  }

  const rows: Share[] = [];

  for (const quota of quotas) {
    const share = shareOf(shares.get(quota.key) ?? 0n);

    if (Option.isNone(share)) {
      return Effect.fail(overflowOf(`the share of ${quota.key}`));
    }

    rows.push({ key: quota.key, shareBasisPoints: share.value });
  }

  return Effect.succeed(rows);
};
