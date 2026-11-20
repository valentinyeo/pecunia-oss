import { ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

export const REPORT_TITLE_MAX_LENGTH = 120;

export const REPORT_BODY_MAX_LENGTH = 200_000;

const disallowedTitleCharacters = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const codePointLength = (text: string): number => {
  let length = 0;

  for (const _ of text) {
    length += 1;
  }

  return length;
};

const withinCodePointMax =
  (maximum: number) =>
  (text: string): boolean =>
    codePointLength(text) <= maximum;

const withinCodePointMin =
  (minimum: number) =>
  (text: string): boolean =>
    codePointLength(text) >= minimum;

export const ReportIdSchema = Schema.NonEmptyString.check(
  Schema.makeFilter(withinCodePointMax(64), {
    expected: "a report id of at most 64 characters",
  })
).pipe(Schema.brand("ReportId"));

export type ReportId = typeof ReportIdSchema.Type;

export const ReportTitleSchema = Schema.Trim.check(
  Schema.makeFilter(withinCodePointMin(1), {
    expected: "a title of at least 1 character",
  }),
  Schema.makeFilter(withinCodePointMax(REPORT_TITLE_MAX_LENGTH), {
    expected: `a title of at most ${REPORT_TITLE_MAX_LENGTH} characters`,
  }),
  Schema.makeFilter((title: string) => !disallowedTitleCharacters.test(title), {
    expected:
      "a title with no control, line, or paragraph separator characters",
  })
).pipe(Schema.brand("ReportTitle"));

export type ReportTitle = typeof ReportTitleSchema.Type;

export const ReportBodySchema = Schema.String.check(
  Schema.makeFilter(withinCodePointMax(REPORT_BODY_MAX_LENGTH), {
    expected: `a body of at most ${REPORT_BODY_MAX_LENGTH} characters`,
  })
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
