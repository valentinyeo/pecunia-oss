import type {
  DateOnly,
  ProfileId,
  TaxObligation,
  TaxProfileId,
} from "@pecunia/core/model";
import { MoneySchema, TaxObligationStatusSchema } from "@pecunia/core/model";
import { Schema } from "effect";

const sameMoney = Schema.toEquivalence(MoneySchema);

const sameStatus = Schema.toEquivalence(TaxObligationStatusSchema);

export const declarationKey = (fields: {
  readonly dueOn: DateOnly;
  readonly kind: string;
  readonly label: string;
  readonly periodEndsOn: DateOnly;
}): string =>
  [fields.kind, fields.label, fields.periodEndsOn, fields.dueOn].join("\u0000");

export const dueKey = (due: TaxObligation): string =>
  [due.taxProfileId, declarationKey(due)].join("\u0000");

export const orderDues = (
  dues: readonly TaxObligation[]
): readonly TaxObligation[] =>
  dues.toSorted((left, right) => {
    const byDueOn = left.dueOn.localeCompare(right.dueOn);

    return byDueOn === 0 ? dueKey(left).localeCompare(dueKey(right)) : byDueOn;
  });

export const sameAmountAndStatus = (
  left: Pick<TaxObligation, "amount" | "status">,
  right: Pick<TaxObligation, "amount" | "status">
): boolean =>
  sameMoney(left.amount, right.amount) && sameStatus(left.status, right.status);

export interface DueOwner {
  readonly profileId: ProfileId;
  readonly taxProfileId: TaxProfileId;
}

export const ownedBy = (due: TaxObligation, owner: DueOwner): boolean =>
  due.profileId === owner.profileId && due.taxProfileId === owner.taxProfileId;
