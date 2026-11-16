import { Schema } from "effect";

import type { Exact } from "./codec.js";

export const CurrencyCodeSchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = Exact<typeof CurrencyCodeSchema.Type>;

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export type MinorUnits = Exact<typeof MinorUnitsSchema.Type>;

export const MoneySchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("Money"));

export type Money = Exact<typeof MoneySchema.Type>;

export const QuantitySchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Quantity"));

export type Quantity = Exact<typeof QuantitySchema.Type>;

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0);

const isCalendarDate = (text: string): boolean => {
  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month)
  );
};

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(isCalendarDate, {
    expected: "a calendar date that exists",
  })
).pipe(Schema.brand("DateOnly"));

export type DateOnly = Exact<typeof DateOnlySchema.Type>;

export const TimestampSchema = Schema.DateTimeUtc.pipe(
  Schema.brand("Timestamp")
);

export type Timestamp = Exact<typeof TimestampSchema.Type>;

const Uuid7 = Schema.String.check(Schema.isUUID(7));

export const ProfileIdSchema = Uuid7.pipe(Schema.brand("ProfileId"));

export type ProfileId = Exact<typeof ProfileIdSchema.Type>;

export const MemberIdSchema = Uuid7.pipe(Schema.brand("MemberId"));

export type MemberId = Exact<typeof MemberIdSchema.Type>;

export const ProviderIdSchema = Schema.String.pipe(Schema.brand("ProviderId"));

export type ProviderId = Exact<typeof ProviderIdSchema.Type>;

export const ProviderAccountIdSchema = Uuid7.pipe(
  Schema.brand("ProviderAccountId")
);

export type ProviderAccountId = Exact<typeof ProviderAccountIdSchema.Type>;

export const PayeeIdSchema = Uuid7.pipe(Schema.brand("PayeeId"));

export type PayeeId = Exact<typeof PayeeIdSchema.Type>;

export const CategoryIdSchema = Uuid7.pipe(Schema.brand("CategoryId"));

export type CategoryId = Exact<typeof CategoryIdSchema.Type>;

export const RuleIdSchema = Uuid7.pipe(Schema.brand("RuleId"));

export type RuleId = Exact<typeof RuleIdSchema.Type>;

export const AliasIdSchema = Uuid7.pipe(Schema.brand("AliasId"));

export type AliasId = Exact<typeof AliasIdSchema.Type>;

export const TransactionIdSchema = Uuid7.pipe(Schema.brand("TransactionId"));

export type TransactionId = Exact<typeof TransactionIdSchema.Type>;

export const SubscriptionIdSchema = Uuid7.pipe(Schema.brand("SubscriptionId"));

export type SubscriptionId = Exact<typeof SubscriptionIdSchema.Type>;

export const HoldingIdSchema = Uuid7.pipe(Schema.brand("HoldingId"));

export type HoldingId = Exact<typeof HoldingIdSchema.Type>;

export const PlatformIdSchema = Schema.String.pipe(Schema.brand("PlatformId"));

export type PlatformId = Exact<typeof PlatformIdSchema.Type>;

export const SyncRunIdSchema = Uuid7.pipe(Schema.brand("SyncRunId"));

export type SyncRunId = Exact<typeof SyncRunIdSchema.Type>;

export const DocumentIdSchema = Uuid7.pipe(Schema.brand("DocumentId"));

export type DocumentId = Exact<typeof DocumentIdSchema.Type>;

export const InvoiceSourceIdSchema = Uuid7.pipe(
  Schema.brand("InvoiceSourceId")
);

export type InvoiceSourceId = Exact<typeof InvoiceSourceIdSchema.Type>;

export const ArchiveTargetIdSchema = Uuid7.pipe(
  Schema.brand("ArchiveTargetId")
);

export type ArchiveTargetId = Exact<typeof ArchiveTargetIdSchema.Type>;

export const TaxProfileIdSchema = Uuid7.pipe(Schema.brand("TaxProfileId"));

export type TaxProfileId = Exact<typeof TaxProfileIdSchema.Type>;

export const TaxObligationIdSchema = Uuid7.pipe(
  Schema.brand("TaxObligationId")
);

export type TaxObligationId = Exact<typeof TaxObligationIdSchema.Type>;

export const ReportIdSchema = Uuid7.pipe(Schema.brand("ReportId"));

export type ReportId = Exact<typeof ReportIdSchema.Type>;
