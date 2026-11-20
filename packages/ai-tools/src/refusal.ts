import { Forbidden } from "@pecunia/access";
import {
  BankLineStoreError,
  CursorFilterMismatch,
  UnknownBankLine,
  UnknownCategory,
} from "@pecunia/bank-lines";
import { Match, Schema } from "effect";
import type { SchemaIssue } from "effect";

export const RefusalReasonSchema = Schema.Literals([
  "alreadyConfirmed",
  "handlerFailed",
  "invalidField",
  "invalidOutput",
  "missingField",
  "notFound",
  "notPermitted",
  "unknownField",
  "unknownTool",
]);

export type RefusalReason = typeof RefusalReasonSchema.Type;

export class ToolRefused extends Schema.TaggedError<
  ToolRefused,
  { readonly brand: unique symbol }
>()("ToolRefused", {
  field: Schema.optional(Schema.String),
  message: Schema.String,
  reason: RefusalReasonSchema,
}) {}

export const ToolFailureSchema = Schema.Union([
  ToolRefused,
  Forbidden,
  BankLineStoreError,
  CursorFilterMismatch,
  UnknownBankLine,
  UnknownCategory,
]);

export type ToolFailure = typeof ToolFailureSchema.Type;

interface IssuePosition {
  readonly leaf: SchemaIssue.Issue;
  readonly path: readonly PropertyKey[];
}

const positionOf = (issue: SchemaIssue.Issue): IssuePosition =>
  Match.value(issue).pipe(
    Match.tag("Pointer", (pointer) => {
      const inner = positionOf(pointer.issue);

      return { leaf: inner.leaf, path: [...pointer.path, ...inner.path] };
    }),
    Match.tag("Filter", (filter) => positionOf(filter.issue)),
    Match.tag("Encoding", (encoding) => positionOf(encoding.issue)),
    Match.tag("Composite", (composite) => positionOf(composite.issues[0])),
    Match.tag("AnyOf", (anyOf) =>
      anyOf.issues[0] === undefined
        ? { leaf: anyOf, path: [] }
        : positionOf(anyOf.issues[0])
    ),
    Match.orElse((leaf) => ({ leaf, path: [] }))
  );

const fieldOf = (path: readonly PropertyKey[]): string =>
  path.map(String).join(".");

const inputReasonOf = (leaf: SchemaIssue.Issue): RefusalReason =>
  Match.value(leaf).pipe(
    Match.tag("UnexpectedKey", (): RefusalReason => "unknownField"),
    Match.tag("MissingKey", (): RefusalReason => "missingField"),
    Match.orElse((): RefusalReason => "invalidField")
  );

export const refusalFromSchema = (
  failure: Schema.SchemaError,
  tool: string,
  source: "input" | "output"
): ToolRefused => {
  const position = positionOf(failure.issue);
  const field = fieldOf(position.path);

  const reason =
    source === "output" ? "invalidOutput" : inputReasonOf(position.leaf);

  const subject = source === "output" ? "answer" : "input";

  return field === ""
    ? new ToolRefused({
        message: `Tool ${tool} refused the ${subject} it was given: ${failure.message}`,
        reason,
      })
    : new ToolRefused({
        field,
        message: `Tool ${tool} refused ${subject} field ${field}: ${failure.message}`,
        reason,
      });
};

export const refusalOfFailure = (failure: ToolFailure): ToolRefused =>
  Match.value(failure).pipe(
    Match.tag("ToolRefused", (refused) => refused),
    Match.tag(
      "Forbidden",
      (forbidden) =>
        new ToolRefused({
          message: `${forbidden.message}. Fix: call this tool for a profile the acting person owns.`,
          reason: "notPermitted",
        })
    ),
    Match.tag(
      "CursorFilterMismatch",
      (mismatch) =>
        new ToolRefused({
          field: "cursor",
          message: `${mismatch.message}. ${mismatch.repair}`,
          reason: "invalidField",
        })
    ),
    Match.tag(
      "UnknownBankLine",
      (unknown) =>
        new ToolRefused({
          field: "lineId",
          message: `${unknown.message}. ${unknown.repair}`,
          reason: "notFound",
        })
    ),
    Match.tag(
      "UnknownCategory",
      (unknown) =>
        new ToolRefused({
          field: "categoryId",
          message: `${unknown.message}. ${unknown.repair}`,
          reason: "notFound",
        })
    ),
    Match.tag(
      "BankLineStoreError",
      (storeError) =>
        new ToolRefused({
          message: `${storeError.message}. ${storeError.repair}`,
          reason: "handlerFailed",
        })
    ),
    Match.exhaustive
  );
