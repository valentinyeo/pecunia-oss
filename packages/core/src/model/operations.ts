import { atRateOperation, convertOperation } from "./base-amount.js";
import {
  convertMinorOperation,
  minorUnitExponentOperation,
} from "./convert-minor.js";
import { convertingOperation } from "./converted-amount.js";
import {
  addMoneyOperation,
  convertedAmountsOperation,
  sameCurrencyAmountOperation,
  sourceAmountOperation,
  subtractMoneyOperation,
} from "./money.js";
import type { OperationEntry } from "./operation.js";
import { rateTextOperation } from "./rate.js";

export const operations = {
  "BaseAmount.atRate": atRateOperation.entry,
  "BaseAmount.convert": convertOperation.entry,
  "ConvertedAmount.converting": convertingOperation.entry,
  addMoney: addMoneyOperation.entry,
  convert: convertOperation.entry,
  convertMinor: convertMinorOperation.entry,
  convertedAmounts: convertedAmountsOperation.entry,
  minorUnitExponent: minorUnitExponentOperation.entry,
  rateText: rateTextOperation.entry,
  sameCurrencyAmount: sameCurrencyAmountOperation.entry,
  sourceAmount: sourceAmountOperation.entry,
  subtractMoney: subtractMoneyOperation.entry,
} as const satisfies Readonly<Record<string, OperationEntry>>;

export const exemptOperations = {
  BaseAmount:
    "the class container itself; atRate is a table entry and isBaseAmount only answers questions about unknown",
  ConvertedAmount:
    "the class container itself; converting is a table entry and restore reads an unknown row through verified",
  "BaseAmount.isBaseAmount":
    "a type predicate over unknown, so it holds no domain value",
  "ConvertedAmount.isConvertedAmount":
    "a type predicate over unknown, so it holds no domain value",
  "ConvertedAmount.restore":
    "a boundary that turns an unknown stored row into a value through verified",
  RATE_SCALE: "a plain number that describes the rate scale",
  codecs: "the table of codec handles, and every handle is a door of the gate",
  conversionInputInvalid:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  conversionOverflow:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  currencyMismatch:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  moneyOverflow:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  parse: "the gate itself, and it takes the schema it gates with",
  rateOnSameCurrency:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  rateUnavailable:
    "an error factory whose field struct holds branded primitives and runs verified in its constructor",
  render: "the gate itself, and it takes the schema it gates with",
  timestampOf:
    "a factory that turns an ISO instant into a branded string through the codec, so it holds no domain object",
  timestampParts:
    "a read that takes a branded string and returns frozen primitives, so it holds no domain object",
  verified: "the gate itself, and it takes the schema it gates with",
} as const satisfies Readonly<Record<string, string>>;

const distinct = (
  entries: readonly OperationEntry[]
): readonly OperationEntry[] =>
  entries.filter((entry, index) => entries.indexOf(entry) === index);

export const operationEntries: readonly OperationEntry[] = distinct(
  Object.values(operations)
);
