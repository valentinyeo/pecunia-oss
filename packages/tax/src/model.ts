import { Schema } from "effect";

export const ProfileIdSchema = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.brand("ProfileId")
);

export const TaxProfileIdSchema = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.brand("TaxProfileId")
);

export const TaxObligationIdSchema = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.brand("TaxObligationId")
);

const TransactionIdSchema = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.brand("TransactionId")
);

export const CurrencyCodeSchema = Schema.NonEmptyString.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export const MoneySchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("Money"));

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

const timestampPattern =
  /^(?<date>\d{4}-\d{2}-\d{2})T(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<millis>\d{3})Z$/u;

const isClockTime = ([hours, minutes, seconds]: readonly string[]): boolean =>
  Number(hours) <= 23 && Number(minutes) <= 59 && Number(seconds) <= 59;

const isCanonicalInstant = (text: string): boolean => {
  const [, date = "", hours = "", minutes = "", seconds = ""] =
    timestampPattern.exec(text) ?? [];

  return isCalendarDate(date) && isClockTime([hours, minutes, seconds]);
};

export const TimestampSchema = Schema.String.check(
  Schema.isPattern(timestampPattern),
  Schema.makeFilter(isCanonicalInstant, {
    expected: "a calendar instant written as YYYY-MM-DDTHH:mm:ss.sssZ",
  })
).pipe(Schema.brand("Timestamp"));

export const TaxObligationStatusSchema = Schema.Union([
  Schema.TaggedStruct("Estimated", { booksStatus: Schema.String }),
  Schema.TaggedStruct("Paid", {
    at: TimestampSchema,
    settledBy: TransactionIdSchema,
  }),
  Schema.TaggedStruct("WrittenOff", { reason: Schema.NonEmptyString }),
]).pipe(Schema.toTaggedUnion("_tag"));

export const TaxProfileSchema = Schema.Struct({
  id: TaxProfileIdSchema,
  jurisdiction: Schema.NonEmptyString,
  primary: Schema.Boolean,
  profileId: ProfileIdSchema,
  yearStart: Schema.Struct({
    day: Schema.Int.check(Schema.isBetween({ maximum: 28, minimum: 1 })),
    month: Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: 1 })),
  }),
});

export const TaxObligationSchema = Schema.Struct({
  amount: MoneySchema,
  dueOn: DateOnlySchema,
  id: TaxObligationIdSchema,
  kind: Schema.NonEmptyString,
  label: Schema.String,
  periodEndsOn: DateOnlySchema,
  profileId: ProfileIdSchema,
  status: TaxObligationStatusSchema,
  syncedAt: TimestampSchema,
  taxProfileId: TaxProfileIdSchema,
});

export const DueDeclarationSchema = Schema.Struct({
  amount: MoneySchema,
  dueOn: DateOnlySchema,
  kind: Schema.NonEmptyString,
  label: Schema.String,
  periodEndsOn: DateOnlySchema,
  status: TaxObligationStatusSchema,
});

export type DueDeclaration = typeof DueDeclarationSchema.Type;

export const ReportedKindsSchema = Schema.Array(Schema.NonEmptyString).check(
  Schema.isNonEmpty()
);

export type ReportedKinds = typeof ReportedKindsSchema.Type;

export const DuesAnswerSchema = Schema.Struct({
  declarations: Schema.Array(DueDeclarationSchema),
  reportedKinds: ReportedKindsSchema,
});

export type DuesAnswer = typeof DuesAnswerSchema.Type;

export const ListTaxDuesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ListTaxDuesRequest = typeof ListTaxDuesRequestSchema.Type;

export const SyncTaxDuesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  taxProfileId: TaxProfileIdSchema,
});

export type SyncTaxDuesRequest = typeof SyncTaxDuesRequestSchema.Type;

export const TaxDuesSchema = Schema.Struct({
  dues: Schema.Array(TaxObligationSchema),
  taxProfiles: Schema.Array(TaxProfileSchema),
});

export type TaxDues = typeof TaxDuesSchema.Type;

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const SyncReceiptSchema = Schema.Struct({
  inserted: count,
  removed: count,
  unchanged: count,
  updated: count,
});

export type SyncReceipt = typeof SyncReceiptSchema.Type;
