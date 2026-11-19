import { ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

export const REPORT_TITLE_MAX_LENGTH = 120;

export const REPORT_BODY_MAX_LENGTH = 200_000;

const controlCharacters = /[\p{Cc}]/u;

export const ReportIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("ReportId"));

export type ReportId = typeof ReportIdSchema.Type;

export const ReportTitleSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(REPORT_TITLE_MAX_LENGTH),
  Schema.makeFilter((title: string) => !controlCharacters.test(title), {
    expected: "a title with no control characters",
  })
).pipe(Schema.brand("ReportTitle"));

export type ReportTitle = typeof ReportTitleSchema.Type;

export const ReportBodySchema = Schema.String.check(
  Schema.isMaxLength(REPORT_BODY_MAX_LENGTH)
).pipe(Schema.brand("ReportBody"));

export type ReportBody = typeof ReportBodySchema.Type;

export const InstantSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("Instant"));

export type Instant = typeof InstantSchema.Type;

const updatedAfterCreated = (report: {
  readonly createdAt: number;
  readonly updatedAt: number;
}): boolean => report.updatedAt >= report.createdAt;

export const ReportSchema = Schema.Struct({
  body: ReportBodySchema,
  createdAt: InstantSchema,
  id: ReportIdSchema,
  ownerProfileId: ProfileIdSchema,
  title: ReportTitleSchema,
  updatedAt: InstantSchema,
}).check(
  Schema.makeFilter(updatedAfterCreated, {
    expected: "a report updated at or after the instant it was created",
  })
);

export type Report = typeof ReportSchema.Type;

export const ReportDraftSchema = Schema.Struct({
  body: Schema.String,
  id: Schema.String,
  title: Schema.String,
});

export type ReportDraft = typeof ReportDraftSchema.Type;
