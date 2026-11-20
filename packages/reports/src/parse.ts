import { Result, Schema } from "effect";

import { InvalidReport } from "./invalid-report.js";
import type { ReportField } from "./invalid-report.js";
import {
  ReportBodySchema,
  ReportIdSchema,
  ReportTitleSchema,
} from "./model.js";
import type {
  ReportBody,
  ReportDraft,
  ReportId,
  ReportTitle,
} from "./model.js";

export interface ReportValues {
  readonly body: ReportBody;
  readonly id: ReportId;
  readonly title: ReportTitle;
}

const RULES: Readonly<Record<ReportField, string>> = {
  body: "A report body holds at most 200000 characters as plain text",
  id: "A report id is 1 to 64 characters",
  title:
    "A report title is 1 to 120 characters after trimming, with no control, line, or paragraph separator characters",
};

const decodeTitle = Schema.decodeUnknownResult(ReportTitleSchema);

const decodeBody = Schema.decodeUnknownResult(ReportBodySchema);

const decodeId = Schema.decodeUnknownResult(ReportIdSchema);

const refuse = (field: ReportField): Result.Result<never, InvalidReport> =>
  Result.fail(new InvalidReport({ field, message: RULES[field] }));

export const parseReportDraft = (
  draft: ReportDraft
): Result.Result<ReportValues, InvalidReport> => {
  const title = decodeTitle(draft.title);

  if (Result.isFailure(title)) {
    return refuse("title");
  }

  const body = decodeBody(draft.body);

  if (Result.isFailure(body)) {
    return refuse("body");
  }

  const id = decodeId(draft.id);

  if (Result.isFailure(id)) {
    return refuse("id");
  }

  return Result.succeed({
    body: body.success,
    id: id.success,
    title: title.success,
  });
};
