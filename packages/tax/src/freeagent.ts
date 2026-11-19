import {
  codecs,
  CurrencyCodeSchema,
  DateOnlySchema,
  parse,
  TaxObligationStatusSchema,
} from "@pecunia/core/model";
import type {
  CurrencyCode,
  DateOnly,
  Money,
  TaxObligationStatus,
} from "@pecunia/core/model";
import { Effect, Option, Result, Schema } from "effect";

import { parseDecimalAmount } from "./amount.js";
import { declarationKey } from "./dues.js";
import type { DueDeclaration } from "./model.js";
import type { TaxBooksService } from "./tax-books.js";
import { TaxDuesRejected } from "./tax-due-rejected.js";
import type { DueField, DueRejection } from "./tax-due-rejected.js";

const selfAssessment = "SelfAssessment";

const selfAssessmentLabel = "Self Assessment";

const RawDueSchema = Schema.Struct({
  amount_due: Schema.optionalKey(Schema.Unknown),
  currency: Schema.optionalKey(Schema.Unknown),
  due_on: Schema.optionalKey(Schema.Unknown),
  period_ends_on: Schema.optionalKey(Schema.Unknown),
  status: Schema.optionalKey(Schema.Unknown),
});

const RawPageSchema = Schema.Struct({
  self_assessment_payments: Schema.Array(Schema.Unknown),
});

const rejection = (
  field: DueField,
  reason: DueRejection["reason"],
  index: number | null
): DueRejection => ({ field, index, reason });

type RawDue = typeof RawDueSchema.Type;

const notText = (
  decoded: Option.Option<string>,
  field: DueField,
  index: number
): DueRejection =>
  Option.isSome(decoded)
    ? rejection(field, "EmptyString", index)
    : rejection(field, "NotAString", index);

const parseCurrency = (
  raw: RawDue,
  index: number
): Result.Result<CurrencyCode, DueRejection> =>
  Option.match(Schema.decodeUnknownOption(CurrencyCodeSchema)(raw.currency), {
    onNone: () =>
      Result.fail(
        notText(
          Schema.decodeUnknownOption(Schema.String)(raw.currency),
          "currency",
          index
        )
      ),
    onSome: (currency) => Result.succeed(currency),
  });

const parseDate = (
  raw: RawDue,
  field: DueField,
  index: number
): Result.Result<DateOnly, DueRejection> => {
  const value = field === "due_on" ? raw.due_on : raw.period_ends_on;

  return Option.match(Schema.decodeUnknownOption(DateOnlySchema)(value), {
    onNone: () =>
      Result.fail(
        notText(Schema.decodeUnknownOption(Schema.String)(value), field, index)
      ),
    onSome: (date) => Result.succeed(date),
  });
};

const parseStatus = (
  raw: RawDue,
  index: number
): Result.Result<TaxObligationStatus, DueRejection> =>
  Option.match(Schema.decodeUnknownOption(Schema.NonEmptyString)(raw.status), {
    onNone: () =>
      Result.fail(
        notText(
          Schema.decodeUnknownOption(Schema.String)(raw.status),
          "status",
          index
        )
      ),
    onSome: (booksStatus) =>
      Result.succeed(
        TaxObligationStatusSchema.cases.Estimated.make({ booksStatus })
      ),
  });

const parseMoney = (
  raw: RawDue,
  currency: CurrencyCode,
  index: number
): Result.Result<Money, DueRejection> =>
  Option.match(Schema.decodeUnknownOption(Schema.String)(raw.amount_due), {
    onNone: () =>
      Result.fail(
        notText(
          Schema.decodeUnknownOption(Schema.String)(raw.amount_due),
          "amount_due",
          index
        )
      ),
    onSome: (text) =>
      Result.match(parseDecimalAmount(text, currency), {
        onFailure: (reason) =>
          Result.fail(rejection("amount_due", reason, index)),
        onSuccess: (minor) =>
          Result.succeed(parse(codecs.money, { currency, minor })),
      }),
  });

interface ParsedFields {
  readonly amount: Money;
  readonly dueOn: DateOnly;
  readonly periodEndsOn: DateOnly;
  readonly status: TaxObligationStatus;
}

const parseFields = (
  raw: typeof RawDueSchema.Type,
  index: number
): Result.Result<ParsedFields, readonly DueRejection[]> => {
  const currency = parseCurrency(raw, index);
  const dueOn = parseDate(raw, "due_on", index);
  const periodEndsOn = parseDate(raw, "period_ends_on", index);
  const status = parseStatus(raw, index);

  const amount = Result.isSuccess(currency)
    ? parseMoney(raw, currency.success, index)
    : undefined;

  const failures: DueRejection[] = [];

  if (Result.isFailure(currency)) {
    failures.push(currency.failure);
  }

  if (Result.isFailure(dueOn)) {
    failures.push(dueOn.failure);
  }

  if (Result.isFailure(periodEndsOn)) {
    failures.push(periodEndsOn.failure);
  }

  if (Result.isFailure(status)) {
    failures.push(status.failure);
  }

  if (amount !== undefined && Result.isFailure(amount)) {
    failures.push(amount.failure);
  }

  if (failures.length > 0) {
    return Result.fail(failures);
  }

  if (
    Result.isSuccess(currency) &&
    Result.isSuccess(dueOn) &&
    Result.isSuccess(periodEndsOn) &&
    Result.isSuccess(status) &&
    amount !== undefined &&
    Result.isSuccess(amount)
  ) {
    return dueOn.success < periodEndsOn.success
      ? Result.fail([rejection("due_on", "DueBeforePeriodEnds", index)])
      : Result.succeed({
          amount: amount.success,
          dueOn: dueOn.success,
          periodEndsOn: periodEndsOn.success,
          status: status.success,
        });
  }

  return Result.fail(failures);
};

export const parseFreeAgentDues = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the recorded books-tool answer is untrusted input, and this function is the schema boundary that parses it.
  payload: unknown
): Result.Result<readonly DueDeclaration[], TaxDuesRejected> => {
  const page = Schema.decodeUnknownOption(RawPageSchema)(payload);

  if (Option.isNone(page)) {
    return Result.fail(
      TaxDuesRejected.make({
        message:
          "FreeAgent returned no self assessment payments list. Fix: record the payload of `/v2/self_assessment_payments`, with a `self_assessment_payments` array.",
        rejections: [
          rejection("self_assessment_payments", "PaymentsMissing", null),
        ],
        repair:
          "Fetch `/v2/self_assessment_payments` from FreeAgent and record the whole response.",
      })
    );
  }

  const dues: DueDeclaration[] = [];
  const rejections: DueRejection[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of page.value.self_assessment_payments.entries()) {
    const raw = Schema.decodeUnknownOption(RawDueSchema)(entry);

    if (Option.isNone(raw)) {
      rejections.push(
        rejection("self_assessment_payments", "NotAnObject", index)
      );
      continue;
    }

    const fields = parseFields(raw.value, index);

    if (Result.isFailure(fields)) {
      rejections.push(...fields.failure);
      continue;
    }

    const declaration: DueDeclaration = {
      amount: fields.success.amount,
      dueOn: fields.success.dueOn,
      kind: selfAssessment,
      label: selfAssessmentLabel,
      periodEndsOn: fields.success.periodEndsOn,
      status: fields.success.status,
    };

    const key = declarationKey(declaration);

    if (seen.has(key)) {
      rejections.push(rejection("period_ends_on", "DuplicateDue", index));
      continue;
    }

    seen.add(key);
    dues.push(declaration);
  }

  if (rejections.length > 0) {
    return Result.fail(
      TaxDuesRejected.make({
        message: `FreeAgent returned ${rejections.length} self assessment payment field(s) that cannot be stored.`,
        rejections,
        repair:
          "Fix the recorded FreeAgent payload: every payment needs a decimal `amount_due`, a three letter `currency`, real `period_ends_on` and `due_on` dates with the due date on or after the period end, and a non-empty `status`.",
      })
    );
  }

  return Result.succeed(dues);
};

export const freeAgentTaxBooks = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the recorded books-tool answer is untrusted input, parsed by `parseFreeAgentDues` on every fetch.
  payload: unknown
): TaxBooksService => ({
  booksTool: "freeagent",
  fetchDues: () => Effect.fromResult(parseFreeAgentDues(payload)),
});
