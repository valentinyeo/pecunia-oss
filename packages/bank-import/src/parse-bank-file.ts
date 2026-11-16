import { BankFileRejected } from "@pecunia/core/bank-import";
import type {
  ImportLineRejection,
  RejectedLine,
} from "@pecunia/core/bank-import";
import type { CurrencyCode } from "@pecunia/core/settings";
import { Effect, Result, Schema } from "effect";

import { ParsedLineSchema } from "./line.js";
import type { FileRow, ParsedBankFile, ParsedLine } from "./line.js";

const HEADER = ["date", "description", "amount_minor", "currency", "reference"];

const DELIMITERS = [",", ";"];

const MAXIMUM_DESCRIPTION_CHARACTERS = 120;

const MAXIMUM_REFERENCE_CHARACTERS = 64;

const DISPLAYED_REJECTION_CHARACTERS = 200;

const MAXIMUM_MINOR = 9_007_199_254_740_991;

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

const AMOUNT_PATTERN = /^-?(?:0|[1-9][0-9]{0,15})$/u;

const CURRENCY_PATTERN = /^[A-Z]{3}$/u;

const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;

interface ScannedLine {
  readonly fields: readonly string[];
  readonly unreadable: boolean;
}

const scanFields = (line: string, delimiter: string): ScannedLine => {
  const fields: string[] = [];
  let current = "";
  let index = 0;
  let insideQuotes = false;
  let unreadable = false;

  while (index < line.length) {
    const character = line.charAt(index);

    if (insideQuotes) {
      if (character === '"') {
        if (line.charAt(index + 1) === '"') {
          current += '"';
          index += 2;
          continue;
        }

        insideQuotes = false;
        index += 1;
        continue;
      }

      current += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      if (current.length > 0) {
        unreadable = true;
      }

      insideQuotes = true;
      index += 1;
      continue;
    }

    if (character === delimiter) {
      fields.push(current);
      current = "";
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  if (insideQuotes) {
    unreadable = true;
  }

  fields.push(current);

  return { fields, unreadable };
};

const normaliseHeaderCell = (cell: string) => cell.trim().toLowerCase();

const isHeader = (fields: readonly string[]) =>
  fields.length === HEADER.length &&
  fields.every((cell, index) => normaliseHeaderCell(cell) === HEADER.at(index));

const delimiterOf = (headerRow: FileRow) =>
  DELIMITERS.find((delimiter) => {
    const scanned = scanFields(headerRow.text, delimiter);

    return !scanned.unreadable && isHeader(scanned.fields);
  });

const fiveFields = (
  fields: readonly string[]
): readonly [string, string, string, string, string] | undefined => {
  const [first, second, third, fourth, fifth] = fields;

  if (
    fields.length !== 5 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined
  ) {
    return undefined;
  }

  return [first, second, third, fourth, fifth];
};

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const monthLengths = [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const daysInMonth = (year: number, month: number) => {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return monthLengths.at(month - 1) ?? 0;
};

const isCalendarDate = (text: string) => {
  if (!DATE_PATTERN.test(text)) {
    return false;
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= daysInMonth(year, month);
};

const parseAmountMinor = (
  text: string
): Result.Result<number, ImportLineRejection> => {
  if (!AMOUNT_PATTERN.test(text) || text === "-0") {
    return Result.fail("bad-amount");
  }

  const amount = Number(text);

  if (!Number.isSafeInteger(amount) || Math.abs(amount) > MAXIMUM_MINOR) {
    return Result.fail("bad-amount");
  }

  return Result.succeed(amount);
};

const rejected = (
  reason: ImportLineRejection
): Result.Result<never, ImportLineRejection> => Result.fail(reason);

const readRow = (
  row: FileRow,
  delimiter: string,
  baseCurrency: CurrencyCode
): Result.Result<ParsedLine, ImportLineRejection> => {
  const scanned = scanFields(row.text, delimiter);

  if (scanned.unreadable) {
    return rejected("field-count");
  }

  const fields = fiveFields(scanned.fields);

  if (fields === undefined) {
    return rejected("field-count");
  }

  const [date, description, amount, currency, reference] = fields;
  const occurredOn = date.trim();

  if (!isCalendarDate(occurredOn)) {
    return rejected("bad-date");
  }

  const amountOutcome = parseAmountMinor(amount.trim());

  if (Result.isFailure(amountOutcome)) {
    return rejected(amountOutcome.failure);
  }

  const amountMinor = amountOutcome.success;

  const currencyCode = currency.trim();

  if (!CURRENCY_PATTERN.test(currencyCode)) {
    return rejected("bad-currency");
  }

  const trimmedDescription = description.trim();
  const trimmedReference = reference.trim();

  if (trimmedDescription.length === 0) {
    return rejected("blank-description");
  }

  if (
    trimmedDescription.length > MAXIMUM_DESCRIPTION_CHARACTERS ||
    trimmedReference.length > MAXIMUM_REFERENCE_CHARACTERS
  ) {
    return rejected("over-long");
  }

  if (
    CONTROL_CHARACTER_PATTERN.test(trimmedDescription) ||
    CONTROL_CHARACTER_PATTERN.test(trimmedReference)
  ) {
    return rejected("non-printable");
  }

  if (currencyCode !== baseCurrency) {
    return rejected("foreign-currency");
  }

  const decoded = Schema.decodeResult(ParsedLineSchema)({
    amountMinor,
    currency: currencyCode,
    date: occurredOn,
    description: trimmedDescription,
    reference: trimmedReference,
  });

  return Result.isFailure(decoded)
    ? rejected("field-count")
    : Result.succeed(decoded.success);
};

const fileRows = (content: string): readonly FileRow[] => {
  const rows: FileRow[] = [];
  let lineNumber = 1;

  for (const text of content.replace(/^\uFEFF/u, "").split(/\r\n|\r|\n/u)) {
    if (text.trim().length > 0) {
      rows.push({ lineNumber, text });
    }

    lineNumber += 1;
  }

  return rows;
};

const displayed = (text: string) =>
  text.length > DISPLAYED_REJECTION_CHARACTERS
    ? text.slice(0, DISPLAYED_REJECTION_CHARACTERS)
    : text;

const rejectedLine = (
  row: FileRow,
  reason: ImportLineRejection
): RejectedLine => ({
  lineNumber: row.lineNumber,
  reason,
  text: displayed(row.text),
});

export interface BankFileRequest {
  readonly baseCurrency: CurrencyCode;
  readonly content: string;
  readonly fileName: string;
}

export const parseBankFile = (
  request: BankFileRequest
): Effect.Effect<ParsedBankFile, BankFileRejected> =>
  Effect.gen(function* parseFile() {
    const rows = fileRows(request.content);
    const [headerRow, ...dataRows] = rows;

    if (headerRow === undefined) {
      return yield* new BankFileRejected({
        fileName: request.fileName,
        reason: "empty",
      });
    }

    const delimiter = delimiterOf(headerRow);

    if (delimiter === undefined) {
      return yield* new BankFileRejected({
        fileName: request.fileName,
        reason: "header",
      });
    }

    if (dataRows.length === 0) {
      return yield* new BankFileRejected({
        fileName: request.fileName,
        reason: "no-rows",
      });
    }

    const lines: ParsedLine[] = [];
    const rejects: RejectedLine[] = [];

    for (const row of dataRows) {
      const outcome = readRow(row, delimiter, request.baseCurrency);

      if (Result.isFailure(outcome)) {
        rejects.push(rejectedLine(row, outcome.failure));
      } else {
        lines.push(outcome.success);
      }
    }

    return { lines, rejected: rejects };
  });
