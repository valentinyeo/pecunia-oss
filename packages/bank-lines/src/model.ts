import { ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

export { ProfileIdSchema };

export type { ProfileId } from "@pecunia/access";

export const BankLineIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("BankLineId"));

export type BankLineId = typeof BankLineIdSchema.Type;

export const CategoryIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("CategoryId"));

export type CategoryId = typeof CategoryIdSchema.Type;

export const ProviderAccountIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("ProviderAccountId"));

export type ProviderAccountId = typeof ProviderAccountIdSchema.Type;

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

export const AmountSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("BankLineAmount"));

export type Amount = typeof AmountSchema.Type;

export const TimestampMillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("TimestampMillis"));

export type TimestampMillis = typeof TimestampMillisSchema.Type;

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const DirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type Direction = typeof DirectionSchema.Type;

export const StatusSchema = Schema.Literals(["pending", "posted", "reversed"]);

export type Status = typeof StatusSchema.Type;

export const NOTE_MAX_LENGTH = 500;

export const NoteTextSchema = Schema.String.check(
  Schema.isMaxLength(NOTE_MAX_LENGTH)
);

export type NoteText = typeof NoteTextSchema.Type;

export const ReviewSchema = Schema.TaggedUnion({
  Awaiting: {},
  Reviewed: { at: TimestampMillisSchema },
});

export type Review = typeof ReviewSchema.Type;

export const BankLineSchema = Schema.Struct({
  accountId: ProviderAccountIdSchema,
  amount: AmountSchema,
  baseAmount: AmountSchema,
  category: Schema.OptionFromNullishOr(CategoryIdSchema),
  direction: DirectionSchema,
  id: BankLineIdSchema,
  note: NoteTextSchema,
  occurredAt: TimestampMillisSchema,
  profileId: ProfileIdSchema,
  raw: Schema.Struct({
    description: Schema.String.check(Schema.isMaxLength(NOTE_MAX_LENGTH)),
    merchant: Schema.String.check(Schema.isMaxLength(NOTE_MAX_LENGTH)),
    reference: Schema.String.check(Schema.isMaxLength(NOTE_MAX_LENGTH)),
  }),
  review: ReviewSchema,
  status: StatusSchema,
  valueDate: DateOnlySchema,
});

export type BankLine = typeof BankLineSchema.Type;

export const PositionSchema = Schema.Struct({
  id: BankLineIdSchema,
  occurredAt: TimestampMillisSchema,
});

export type Position = typeof PositionSchema.Type;

export const BankLineCursorSchema = PositionSchema;

export type BankLineCursor = typeof BankLineCursorSchema.Type;

const withinRange = (value: { readonly max: number; readonly min: number }) =>
  value.min <= value.max;

export const AmountRangeSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  max: MinorUnitsSchema,
  min: MinorUnitsSchema,
}).check(
  Schema.makeFilter(withinRange, {
    expected: "a minimum no greater than the maximum",
  })
);

export type AmountRange = typeof AmountRangeSchema.Type;

export const OccurredRangeSchema = Schema.Struct({
  from: TimestampMillisSchema,
  to: TimestampMillisSchema,
}).check(
  Schema.makeFilter((range) => range.from <= range.to, {
    expected: "a start no later than the end",
  })
);

export type OccurredRange = typeof OccurredRangeSchema.Type;

export const CategoryFilterSchema = Schema.TaggedUnion({
  Any: {},
  Uncategorised: {},
  Of: { categoryId: CategoryIdSchema },
});

export type CategoryFilter = typeof CategoryFilterSchema.Type;

export const ReviewFilterSchema = Schema.TaggedUnion({
  Any: {},
  Awaiting: {},
  Reviewed: {},
});

export type ReviewFilter = typeof ReviewFilterSchema.Type;

export const BankLineFilterSchema = Schema.Struct({
  account: Schema.OptionFromNullishOr(ProviderAccountIdSchema),
  amount: Schema.OptionFromNullishOr(AmountRangeSchema),
  category: CategoryFilterSchema,
  direction: Schema.OptionFromNullishOr(DirectionSchema),
  occurred: Schema.OptionFromNullishOr(OccurredRangeSchema),
  review: ReviewFilterSchema,
});

export type BankLineFilter = typeof BankLineFilterSchema.Type;

export const SEARCH_MAX_LENGTH = 200;

export const SEARCH_LIMIT_MAX = 200;

export const SearchTextSchema = Schema.String.check(
  Schema.isMaxLength(SEARCH_MAX_LENGTH)
);

export type SearchText = typeof SearchTextSchema.Type;

export const PageLimitSchema = Schema.Int.check(
  Schema.isBetween({ maximum: SEARCH_LIMIT_MAX, minimum: 1 })
);

export type PageLimit = typeof PageLimitSchema.Type;

export const BankLineQuerySchema = Schema.Struct({
  cursor: Schema.OptionFromNullishOr(BankLineCursorSchema),
  filter: BankLineFilterSchema,
  limit: PageLimitSchema,
  search: SearchTextSchema,
});

export type BankLineQuery = typeof BankLineQuerySchema.Type;

export const ListBankLinesRequestSchema = Schema.Struct({
  ...BankLineQuerySchema.fields,
  profileId: ProfileIdSchema,
});

export type ListBankLinesRequest = typeof ListBankLinesRequestSchema.Type;

export const BankLinePageSchema = Schema.Struct({
  lines: Schema.Array(BankLineSchema),
  next: Schema.OptionFromNullishOr(BankLineCursorSchema),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type BankLinePage = typeof BankLinePageSchema.Type;

export const CategoryChangeSchema = Schema.TaggedUnion({
  Assigned: { categoryId: CategoryIdSchema },
  Cleared: {},
  Unchanged: {},
});

export type CategoryChange = typeof CategoryChangeSchema.Type;

export const NoteChangeSchema = Schema.TaggedUnion({
  Set: { text: NoteTextSchema },
  Unchanged: {},
});

export type NoteChange = typeof NoteChangeSchema.Type;

export const LineEditSchema = Schema.Struct({
  category: CategoryChangeSchema,
  lineId: BankLineIdSchema,
  note: NoteChangeSchema,
});

export type LineEdit = typeof LineEditSchema.Type;

export const EditBankLineRequestSchema = Schema.Struct({
  ...LineEditSchema.fields,
  profileId: ProfileIdSchema,
});

export type EditBankLineRequest = typeof EditBankLineRequestSchema.Type;

export const LineReviewSchema = Schema.Struct({
  lineId: BankLineIdSchema,
});

export type LineReview = typeof LineReviewSchema.Type;

export const ReviewBankLineRequestSchema = Schema.Struct({
  ...LineReviewSchema.fields,
  profileId: ProfileIdSchema,
});

export type ReviewBankLineRequest = typeof ReviewBankLineRequestSchema.Type;
