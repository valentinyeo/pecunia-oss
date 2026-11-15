import { Schema } from "effect";

export const CurrencyCodeSchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

export const MoneySchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("Money"));

export type Money = typeof MoneySchema.Type;

export const BaseAmountSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("BaseAmount"));

export type BaseAmount = typeof BaseAmountSchema.Type;

export const QuantitySchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Quantity"));

export type Quantity = typeof QuantitySchema.Type;

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const TimestampSchema = Schema.DateTimeUtc.pipe(
  Schema.brand("Timestamp")
);

export type Timestamp = typeof TimestampSchema.Type;

const Uuid7 = Schema.String.check(Schema.isUUID(7));

export const ProfileIdSchema = Uuid7.pipe(Schema.brand("ProfileId"));

export type ProfileId = typeof ProfileIdSchema.Type;

export const MemberIdSchema = Uuid7.pipe(Schema.brand("MemberId"));

export type MemberId = typeof MemberIdSchema.Type;

export const ProviderIdSchema = Schema.String.pipe(Schema.brand("ProviderId"));

export type ProviderId = typeof ProviderIdSchema.Type;

export const ProviderAccountIdSchema = Uuid7.pipe(
  Schema.brand("ProviderAccountId")
);

export type ProviderAccountId = typeof ProviderAccountIdSchema.Type;

export const PayeeIdSchema = Uuid7.pipe(Schema.brand("PayeeId"));

export type PayeeId = typeof PayeeIdSchema.Type;

export const CategoryIdSchema = Uuid7.pipe(Schema.brand("CategoryId"));

export type CategoryId = typeof CategoryIdSchema.Type;

export const RuleIdSchema = Uuid7.pipe(Schema.brand("RuleId"));

export type RuleId = typeof RuleIdSchema.Type;

export const AliasIdSchema = Uuid7.pipe(Schema.brand("AliasId"));

export type AliasId = typeof AliasIdSchema.Type;

export const TransactionIdSchema = Uuid7.pipe(Schema.brand("TransactionId"));

export type TransactionId = typeof TransactionIdSchema.Type;

export const SubscriptionIdSchema = Uuid7.pipe(Schema.brand("SubscriptionId"));

export type SubscriptionId = typeof SubscriptionIdSchema.Type;

export const HoldingIdSchema = Uuid7.pipe(Schema.brand("HoldingId"));

export type HoldingId = typeof HoldingIdSchema.Type;

export const PlatformIdSchema = Schema.String.pipe(Schema.brand("PlatformId"));

export type PlatformId = typeof PlatformIdSchema.Type;

export const SyncRunIdSchema = Uuid7.pipe(Schema.brand("SyncRunId"));

export type SyncRunId = typeof SyncRunIdSchema.Type;

export const DocumentIdSchema = Uuid7.pipe(Schema.brand("DocumentId"));

export type DocumentId = typeof DocumentIdSchema.Type;

export const InvoiceSourceIdSchema = Uuid7.pipe(
  Schema.brand("InvoiceSourceId")
);

export type InvoiceSourceId = typeof InvoiceSourceIdSchema.Type;

export const ArchiveTargetIdSchema = Uuid7.pipe(
  Schema.brand("ArchiveTargetId")
);

export type ArchiveTargetId = typeof ArchiveTargetIdSchema.Type;

export const TaxProfileIdSchema = Uuid7.pipe(Schema.brand("TaxProfileId"));

export type TaxProfileId = typeof TaxProfileIdSchema.Type;

export const TaxObligationIdSchema = Uuid7.pipe(
  Schema.brand("TaxObligationId")
);

export type TaxObligationId = typeof TaxObligationIdSchema.Type;

export const ReportIdSchema = Uuid7.pipe(Schema.brand("ReportId"));

export type ReportId = typeof ReportIdSchema.Type;
