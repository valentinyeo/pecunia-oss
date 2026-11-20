import { ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

import { isCalendarDate } from "./civil.js";

export { ProfileIdSchema };

export type { ProfileId } from "@pecunia/access";

export const SubscriptionIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("SubscriptionId"));

export type SubscriptionId = typeof SubscriptionIdSchema.Type;

export const PayeeIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("PayeeId"));

export type PayeeId = typeof PayeeIdSchema.Type;

export const PayeeNameSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(120)
);

export type PayeeName = typeof PayeeNameSchema.Type;

export const CategoryIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("CategoryId"));

export type CategoryId = typeof CategoryIdSchema.Type;

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

export const MoneySchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("Money"));

export type Money = typeof MoneySchema.Type;

export const PaymentMinorSchema = Schema.Int.check(
  Schema.isGreaterThan(0),
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("PaymentMinor"));

export type PaymentMinor = typeof PaymentMinorSchema.Type;

export const PaymentSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: PaymentMinorSchema,
}).pipe(Schema.brand("Payment"));

export type Payment = typeof PaymentSchema.Type;

export const TimestampMillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("TimestampMillis"));

export type TimestampMillis = typeof TimestampMillisSchema.Type;

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(isCalendarDate, {
    expected: "a calendar date that exists",
  })
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const CountSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export type Count = typeof CountSchema.Type;

export const ConfidenceSchema = Schema.Finite.check(
  Schema.isBetween({ maximum: 1, minimum: 0 })
);

export type Confidence = typeof ConfidenceSchema.Type;

export const DirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type Direction = typeof DirectionSchema.Type;

export const FREQUENCIES = [
  "annual",
  "monthly",
  "quarterly",
  "weekly",
] as const;

export const FrequencySchema = Schema.Literals(FREQUENCIES);

export type Frequency = typeof FrequencySchema.Type;

export const StatusTagSchema = Schema.Literals([
  "Cancelled",
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
]);

export type StatusTag = typeof StatusTagSchema.Type;

export const RestorableTagSchema = Schema.Literals([
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
]);

export type RestorableTag = typeof RestorableTagSchema.Type;

export const StatusSchema = Schema.TaggedUnion({
  Cancelled: { at: TimestampMillisSchema },
  Confirmed: { at: TimestampMillisSchema },
  Detected: { at: TimestampMillisSchema },
  Dismissed: { at: TimestampMillisSchema },
  NotRecurring: { at: TimestampMillisSchema },
});

export type Status = typeof StatusSchema.Type;

export const SubscriptionSchema = Schema.Struct({
  amount: PaymentSchema,
  baseAmount: PaymentSchema,
  categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  confidence: ConfidenceSchema,
  frequency: FrequencySchema,
  id: SubscriptionIdSchema,
  lastChargedOn: DateOnlySchema,
  nextExpectedOn: DateOnlySchema,
  occurrenceCount: CountSchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
  status: StatusSchema,
});

export type Subscription = typeof SubscriptionSchema.Type;

export const SubscriptionEntrySchema = Schema.Struct({
  payeeName: PayeeNameSchema,
  subscription: SubscriptionSchema,
});

export type SubscriptionEntry = typeof SubscriptionEntrySchema.Type;

export const PayeeSchema = Schema.Struct({
  id: PayeeIdSchema,
  name: PayeeNameSchema,
  profileId: ProfileIdSchema,
});

export type Payee = typeof PayeeSchema.Type;

export const ChargeSchema = Schema.Struct({
  amount: PaymentSchema,
  baseAmount: PaymentSchema,
  categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  direction: DirectionSchema,
  on: DateOnlySchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type Charge = typeof ChargeSchema.Type;

export const SubscriptionCostSchema = Schema.Struct({
  annual: MoneySchema,
  monthly: MoneySchema,
});

export type SubscriptionCost = typeof SubscriptionCostSchema.Type;

export const SubscriptionViewSchema = Schema.Struct({
  categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  confidence: ConfidenceSchema,
  cost: SubscriptionCostSchema,
  frequency: FrequencySchema,
  id: SubscriptionIdSchema,
  lastChargedOn: DateOnlySchema,
  nextCharge: Schema.OptionFromNullishOr(DateOnlySchema),
  occurrenceCount: CountSchema,
  payeeId: PayeeIdSchema,
  payeeName: PayeeNameSchema,
  status: StatusSchema,
});

export type SubscriptionView = typeof SubscriptionViewSchema.Type;

export const SubscriptionFilterSchema = Schema.TaggedUnion({
  Active: {},
  All: {},
});

export type SubscriptionFilter = typeof SubscriptionFilterSchema.Type;

export const SubscriptionQuerySchema = Schema.Struct({
  filter: SubscriptionFilterSchema,
});

export type SubscriptionQuery = typeof SubscriptionQuerySchema.Type;

export const ListSubscriptionsRequestSchema = Schema.Struct({
  ...SubscriptionQuerySchema.fields,
  profileId: ProfileIdSchema,
});

export type ListSubscriptionsRequest =
  typeof ListSubscriptionsRequestSchema.Type;

export const SubscriptionPageSchema = Schema.Struct({
  activeAnnual: MoneySchema,
  activeMonthly: MoneySchema,
  baseCurrency: CurrencyCodeSchema,
  subscriptions: Schema.Array(SubscriptionViewSchema),
});

export type SubscriptionPage = typeof SubscriptionPageSchema.Type;

export const StatusChangeSchema = Schema.TaggedUnion({
  Cancel: {},
  Confirm: {},
  Dismiss: {},
  MarkNotRecurring: {},
  MarkRecurring: {},
  Restore: { to: RestorableTagSchema },
});

export type StatusChange = typeof StatusChangeSchema.Type;

export const SubscriptionCategoryChangeSchema = Schema.TaggedUnion({
  Assign: { categoryId: CategoryIdSchema },
  Clear: {},
});

export type SubscriptionCategoryChange =
  typeof SubscriptionCategoryChangeSchema.Type;

export const ChangeSubscriptionStatusRequestSchema = Schema.Struct({
  change: StatusChangeSchema,
  profileId: ProfileIdSchema,
  subscriptionId: SubscriptionIdSchema,
});

export type ChangeSubscriptionStatusRequest =
  typeof ChangeSubscriptionStatusRequestSchema.Type;

export const SetSubscriptionCategoryRequestSchema = Schema.Struct({
  category: SubscriptionCategoryChangeSchema,
  profileId: ProfileIdSchema,
  subscriptionId: SubscriptionIdSchema,
});

export type SetSubscriptionCategoryRequest =
  typeof SetSubscriptionCategoryRequestSchema.Type;

export const MarkRepeatPaymentRequestSchema = Schema.Struct({
  frequency: FrequencySchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type MarkRepeatPaymentRequest =
  typeof MarkRepeatPaymentRequestSchema.Type;

export const FindRepeatPaymentsRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type FindRepeatPaymentsRequest =
  typeof FindRepeatPaymentsRequestSchema.Type;

export const DetectedRepeatPaymentSchema = Schema.Struct({
  confidence: ConfidenceSchema,
  frequency: FrequencySchema,
  lastChargedOn: DateOnlySchema,
  nextExpectedOn: DateOnlySchema,
  occurrenceCount: CountSchema,
  payeeId: PayeeIdSchema,
  payeeName: PayeeNameSchema,
  typicalAmount: PaymentSchema,
  typicalBaseAmount: PaymentSchema,
});

export type DetectedRepeatPayment = typeof DetectedRepeatPaymentSchema.Type;

export const RepeatPaymentPageSchema = Schema.Struct({
  payments: Schema.Array(DetectedRepeatPaymentSchema),
});

export type RepeatPaymentPage = typeof RepeatPaymentPageSchema.Type;
