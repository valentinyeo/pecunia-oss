import { Option, Result, Schema } from "effect";

import {
  CursorSchema,
  CurrencyCodeSchema,
  ProviderLineIdSchema,
  ProviderLineSchema,
} from "./model.js";
import type {
  Cursor,
  LineField,
  ProviderLine,
  ProviderLineId,
  RawProviderLine,
  RawProviderPage,
  RejectedLine,
  RejectionReason,
} from "./model.js";

export interface InvalidCursor {
  readonly _tag: "InvalidCursor";
  readonly reason: string;
}

export const InvalidCursorSchema = Schema.TaggedStruct("InvalidCursor", {
  reason: Schema.String,
});

export interface ParsedPage {
  readonly lines: readonly ProviderLine[];
  readonly nextCursor: Cursor | null;
  readonly rejected: readonly RejectedLine[];
}

export interface LineFieldRejection {
  readonly field: LineField;
  readonly reason: RejectionReason;
}

const asString = Schema.is(Schema.String);

const asNumber = Schema.is(Schema.Finite);

const rejection = (
  field: LineField,
  reason: RejectionReason
): LineFieldRejection => ({ field, reason });

const rawId = (raw: RawProviderLine): string | null =>
  asString(raw.providerLineId) ? raw.providerLineId : null;

const parseId = (
  raw: RawProviderLine
): Result.Result<ProviderLineId, LineFieldRejection> =>
  Option.match(
    Schema.decodeUnknownOption(ProviderLineIdSchema)(raw.providerLineId),
    {
      onNone: () =>
        Result.fail(
          rejection(
            "providerLineId",
            asString(raw.providerLineId) ? "EmptyString" : "NotAString"
          )
        ),
      onSome: (parsed) => Result.succeed(parsed),
    }
  );

const parseBookedOn = (
  raw: RawProviderLine
): Result.Result<ProviderLine["bookedOn"], LineFieldRejection> =>
  Option.match(
    Schema.decodeUnknownOption(ProviderLineSchema.fields.bookedOn)(
      raw.bookedOn
    ),
    {
      onNone: () =>
        Result.fail(
          rejection(
            "bookedOn",
            asString(raw.bookedOn) ? "NotADate" : "NotAString"
          )
        ),
      onSome: (parsed) => Result.succeed(parsed),
    }
  );

const parseAmountMinor = (
  raw: RawProviderLine
): Result.Result<ProviderLine["amountMinor"], LineFieldRejection> =>
  Option.match(
    Schema.decodeUnknownOption(ProviderLineSchema.fields.amountMinor)(
      raw.amountMinor
    ),
    {
      onNone: () =>
        Result.fail(
          rejection(
            "amountMinor",
            asNumber(raw.amountMinor) ? "NotASafeInteger" : "NotANumber"
          )
        ),
      onSome: (parsed) => Result.succeed(parsed),
    }
  );

const parseCurrency = (
  raw: RawProviderLine
): Result.Result<ProviderLine["currency"], LineFieldRejection> =>
  Option.match(Schema.decodeUnknownOption(CurrencyCodeSchema)(raw.currency), {
    onNone: () =>
      Result.fail(
        rejection(
          "currency",
          asString(raw.currency) ? "NotACurrencyCode" : "NotAString"
        )
      ),
    onSome: (parsed) => Result.succeed(parsed),
  });

const parseDescription = (
  raw: RawProviderLine
): Result.Result<string, LineFieldRejection> =>
  Option.match(Schema.decodeUnknownOption(Schema.String)(raw.description), {
    onNone: () => Result.fail(rejection("description", "NotAString")),
    onSome: (parsed) => Result.succeed(parsed),
  });

const rejectLine = (
  index: number,
  lineRejection: LineFieldRejection,
  raw: RawProviderLine
): RejectedLine => ({
  field: lineRejection.field,
  index,
  rawProviderLineId: rawId(raw),
  reason: lineRejection.reason,
});

export const parseProviderLine = (
  raw: RawProviderLine,
  index: number
): Result.Result<ProviderLine, RejectedLine> => {
  const providerLineId = parseId(raw);

  if (Result.isFailure(providerLineId)) {
    return Result.fail(rejectLine(index, providerLineId.failure, raw));
  }

  const bookedOn = parseBookedOn(raw);

  if (Result.isFailure(bookedOn)) {
    return Result.fail(rejectLine(index, bookedOn.failure, raw));
  }

  const amountMinor = parseAmountMinor(raw);

  if (Result.isFailure(amountMinor)) {
    return Result.fail(rejectLine(index, amountMinor.failure, raw));
  }

  const currency = parseCurrency(raw);

  if (Result.isFailure(currency)) {
    return Result.fail(rejectLine(index, currency.failure, raw));
  }

  const description = parseDescription(raw);

  if (Result.isFailure(description)) {
    return Result.fail(rejectLine(index, description.failure, raw));
  }

  return Result.succeed({
    amountMinor: amountMinor.success,
    bookedOn: bookedOn.success,
    currency: currency.success,
    description: description.success,
    providerLineId: providerLineId.success,
  });
};

const parseNextCursor = (
  page: RawProviderPage
): Result.Result<Cursor | null, InvalidCursor> => {
  if (page.nextCursor === null) {
    return Result.succeed(null);
  }

  const decoded = Schema.decodeUnknownOption(CursorSchema)(page.nextCursor);

  if (Option.isNone(decoded)) {
    return Result.fail(
      InvalidCursorSchema.make({
        reason: "Provider returned a cursor that is not a non-empty string",
      })
    );
  }

  return Result.succeed(decoded.value);
};

export const parsePage = (
  page: RawProviderPage
): Result.Result<ParsedPage, InvalidCursor> => {
  const nextCursor = parseNextCursor(page);

  if (Result.isFailure(nextCursor)) {
    return Result.fail(nextCursor.failure);
  }

  const lines: ProviderLine[] = [];
  const rejected: RejectedLine[] = [];

  for (const [index, raw] of page.lines.entries()) {
    const parsed = parseProviderLine(raw, index);

    if (Result.isFailure(parsed)) {
      rejected.push(parsed.failure);
    } else {
      lines.push(parsed.success);
    }
  }

  return Result.succeed({
    lines,
    nextCursor: nextCursor.success,
    rejected,
  });
};
