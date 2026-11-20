import { Schema } from "effect";

export const CostOperationSchema = Schema.Literals([
  "annual",
  "monthly",
  "total",
]);

export type CostOperation = typeof CostOperationSchema.Type;

export class SubscriptionCostOverflow extends Schema.TaggedError<
  SubscriptionCostOverflow,
  { readonly brand: unique symbol }
>()("SubscriptionCostOverflow", {
  message: Schema.String,
  operation: CostOperationSchema,
  repair: Schema.String,
}) {}
