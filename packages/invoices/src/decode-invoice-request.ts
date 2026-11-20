import { Effect, Match, Option, Result, Schema } from "effect";
import type { SchemaIssue } from "effect";

import { InvalidInvoiceRequest } from "./invalid-invoice-request.js";
import { InvoiceExceptionRefused } from "./invoice-exception-refused.js";
import { LegacyFilesRefused } from "./legacy-files-refused.js";
import {
  EXCEPTION_REASON_MAX,
  ExceptionReasonSchema,
  LEGACY_FILES_MAX,
  ProfileIdSchema,
  RegisterLegacyInvoicesRequestSchema,
  TransactionIdSchema,
  type ProfileId,
  type RecordInvoiceExceptionRequest,
  type RegisterLegacyInvoicesRequest,
} from "./model.js";

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
    Match.tag("Composite", (composite) =>
      composite.issues[0] === undefined
        ? { leaf: composite, path: [] }
        : positionOf(composite.issues[0])
    ),
    Match.tag("AnyOf", (anyOf) =>
      anyOf.issues[0] === undefined
        ? { leaf: anyOf, path: [] }
        : positionOf(anyOf.issues[0])
    ),
    Match.orElse((leaf) => ({ leaf, path: [] }))
  );

const fieldOf = (path: readonly PropertyKey[]): string =>
  path.map(String).join(".");

const FIELD_LABELS: Record<string, string> = {
  contentType: "content type",
  cursor: "cursor",
  documentDate: "document date",
  documentId: "document id",
  fileId: "archive file id",
  limit: "page limit",
  loginHint: "login hint",
  month: "month",
  notes: "note",
  originalFilename: "file name",
  pattern: "pattern",
  placeId: "archive place id",
  portalUrl: "portal URL",
  profileId: "profile id",
  r2Key: "storage key",
  reason: "invoice reason",
  rootRef: "archive root",
  sha256: "SHA-256 fingerprint",
  source: "document source",
  sourceId: "invoice source id",
  transactionId: "payment id",
};

const fieldLabel = (field: string): string =>
  FIELD_LABELS[field] ?? (field === "" ? "request" : field);

const trimLength = (value: unknown): number =>
  typeof value === "string" ? value.trim().length : 0;

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

const textLength = (value: unknown): number =>
  typeof value === "string" ? value.length : 0;

const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const fixFromField = (field: string, raw: unknown): string => {
  const label = fieldLabel(field);
  const trimmed = trimLength(raw);
  const length = textLength(raw);
  const count = arrayLength(raw);
  const number = numberOf(raw);

  if (field === "month") {
    return "send a month as YYYY-MM with a real calendar month and try again.";
  }

  if (field === "limit") {
    return "send a page limit between 1 and 200 and try again.";
  }

  if (field === "cursor") {
    return "send a cursor from the previous page, or omit it on the first page, and try again.";
  }

  if (field === "source") {
    return "send one of upload, email, agent, or legacy_upload and try again.";
  }

  if (field === "files" && count > LEGACY_FILES_MAX) {
    return `send them in batches of ${LEGACY_FILES_MAX} or fewer files.`;
  }

  if (field === "files" && count === 0) {
    return `send at least one file, up to ${LEGACY_FILES_MAX} in a batch.`;
  }

  if (field === "reason" && length > EXCEPTION_REASON_MAX) {
    return `shorten the reason to ${EXCEPTION_REASON_MAX} characters or fewer, then record the reason again.`;
  }

  if (length > 512 && field === "originalFilename") {
    return "shorten the file name and try again.";
  }

  if (length > 64 && field === "transactionId") {
    return "shorten the payment id to 64 characters or fewer and try again.";
  }

  if (number !== undefined && field === "limit") {
    return "send a page limit between 1 and 200 and try again.";
  }

  if (trimmed === 0) {
    return `write a non-blank ${label} and try again.`;
  }

  return `correct the ${label} and try again.`;
};

const fixFor = (field: string, leaf: SchemaIssue.Issue, raw: unknown): string =>
  Match.value(leaf).pipe(
    Match.tag("MissingKey", () => {
      const label = fieldLabel(field);

      return `send a non-empty ${label} and try again.`;
    }),
    Match.tag("UnexpectedKey", () => "remove the extra key and try again."),
    Match.tag("InvalidType", () => {
      const label = fieldLabel(field);

      return `send ${label} in the shape the capability expects and try again.`;
    }),
    Match.tag("InvalidValue", () => fixFromField(field, raw)),
    Match.tag("Filter", () => fixFromField(field, raw)),
    Match.orElse(() => fixFromField(field, raw))
  );

const detailFromField = (field: string, raw: unknown): string => {
  const label = fieldLabel(field);
  const trimmed = trimLength(raw);
  const length = textLength(raw);
  const count = arrayLength(raw);
  const number = numberOf(raw);

  if (field === "month") {
    return "The month is not a real calendar month in YYYY-MM form.";
  }

  if (field === "limit" && number !== undefined) {
    return `The page limit is ${number} and the allowed range is 1 to 200.`;
  }

  if (field === "files" && count > LEGACY_FILES_MAX) {
    return `The legacy batch carries ${count} files and the limit is ${LEGACY_FILES_MAX}.`;
  }

  if (field === "files" && count === 0) {
    return "The legacy batch carries no files, so there is nothing to register.";
  }

  if (field === "reason" && trimmed === 0) {
    return "The invoice reason is empty, so the payment still looks missing an invoice.";
  }

  if (field === "reason" && length > EXCEPTION_REASON_MAX) {
    return `The invoice reason is ${length} characters long and the limit is ${EXCEPTION_REASON_MAX}.`;
  }

  if (length > 512 && field === "originalFilename") {
    return `The file name is ${length} characters long and the limit is 512.`;
  }

  if (length > 64 && field === "transactionId") {
    return `The payment id is ${length} characters long and the limit is 64.`;
  }

  if (trimmed === 0) {
    return `The ${label} is blank after trimming.`;
  }

  if (field === "pattern" && length > 200) {
    return `The pattern is ${length} characters long and the limit is 200.`;
  }

  if (field === "source") {
    return "The document source is not one the invoice book stores.";
  }

  if (field === "cursor") {
    return "The cursor does not match any archived document the profile owns.";
  }

  return `The ${label} does not pass the capability's checks.`;
};

const detailOf = (
  field: string,
  leaf: SchemaIssue.Issue,
  raw: unknown
): string =>
  Match.value(leaf).pipe(
    Match.tag("MissingKey", () => {
      const label = fieldLabel(field);

      return `The ${label} is missing.`;
    }),
    Match.tag("UnexpectedKey", () => "The request carries an unknown field."),
    Match.tag("InvalidType", () => {
      const label = fieldLabel(field);

      return `The ${label} is not the type the capability expects.`;
    }),
    Match.tag("InvalidValue", () => detailFromField(field, raw)),
    Match.tag("Filter", () => detailFromField(field, raw)),
    Match.orElse(() => detailFromField(field, raw))
  );

export const invalidInvoiceRequestOf = (
  capability: string,
  failure: Schema.SchemaError,
  rawAtPath?: unknown
): InvalidInvoiceRequest => {
  const position = positionOf(failure.issue);
  const field = fieldOf(position.path) || "request";
  const detail = detailOf(field, position.leaf, rawAtPath);
  const fix = fixFor(field, position.leaf, rawAtPath);

  return new InvalidInvoiceRequest({
    capability,
    field,
    message: `${detail} Fix: ${fix}`,
    repair: `Fix: ${fix}`,
  });
};

export const decodeInvoiceRequest = <A>(
  capability: string,
  schema: Schema.Schema<A>,
  input: unknown
): Effect.Effect<A, InvalidInvoiceRequest, never> => {
  if (Schema.is(schema)(input)) {
    // SAFETY: Schema.is narrows input to A when it returns true.
    return Effect.succeed(input);
  }

  const parsed = Schema.decodeUnknownResult(schema)(input);

  if (Result.isSuccess(parsed)) {
    return Effect.succeed(parsed.success as A);
  }

  return Effect.fail(
    invalidInvoiceRequestOf(capability, parsed.failure, input)
  );
};

const profileIdFrom = (input: unknown): ProfileId | undefined => {
  const candidate =
    typeof input === "object" && input !== null && "profileId" in input
      ? (input as { profileId: unknown }).profileId
      : undefined;

  return Schema.decodeUnknownOption(ProfileIdSchema)(candidate).pipe(
    Option.getOrUndefined
  );
};

const exceptionRefusalOf = (
  profileId: ProfileId,
  transactionId: typeof TransactionIdSchema.Type,
  reason: unknown
): InvoiceExceptionRefused => {
  const reasonLength = typeof reason === "string" ? reason.trim().length : 0;

  if (reasonLength === 0) {
    return new InvoiceExceptionRefused({
      message:
        "The invoice reason is empty, so the payment still looks missing an invoice.",
      profileId,
      reasonLength,
      repair:
        "Write why the payment has no invoice, up to 500 characters, then record the reason again.",
      transactionId,
    });
  }

  return new InvoiceExceptionRefused({
    message: `The invoice reason is ${reasonLength} characters long and the limit is ${EXCEPTION_REASON_MAX}.`,
    profileId,
    reasonLength,
    repair: `Shorten the reason to ${EXCEPTION_REASON_MAX} characters or fewer, then record the reason again.`,
    transactionId,
  });
};

const legacyRefusalOf = (
  profileId: ProfileId,
  count: number
): LegacyFilesRefused => {
  if (count > LEGACY_FILES_MAX) {
    return new LegacyFilesRefused({
      count,
      message: `The legacy batch carries ${count} files and the limit is ${LEGACY_FILES_MAX}.`,
      profileId,
      repair: `Send them in batches of ${LEGACY_FILES_MAX} or fewer files.`,
    });
  }

  if (count === 0) {
    return new LegacyFilesRefused({
      count,
      message:
        "The legacy batch carries no files, so there is nothing to register.",
      profileId,
      repair: `Send at least one file, up to ${LEGACY_FILES_MAX} in a batch.`,
    });
  }

  return new LegacyFilesRefused({
    count,
    message:
      "A file in the legacy batch is missing a field the invoice book stores.",
    profileId,
    repair:
      "Send every file with the fields `registerLegacyInvoices` asks for, then try again.",
  });
};

const isBatchSizeIssue = (
  failure: Schema.SchemaError,
  count: number
): boolean => {
  const field = fieldOf(positionOf(failure.issue).path);

  if (count > LEGACY_FILES_MAX || count === 0) {
    return field === "files" || field.startsWith("files.");
  }

  return field === "files";
};

const filesCountOf = (input: unknown): number => {
  const files =
    typeof input === "object" && input !== null && "files" in input
      ? (input as { files: unknown }).files
      : undefined;

  return Array.isArray(files) ? files.length : 0;
};

const fieldRaw = (input: unknown, key: string): unknown => {
  if (typeof input !== "object" || input === null || !(key in input)) {
    return undefined;
  }

  // SAFETY: key is present on a non-null object; the value is still unknown at the boundary.
  return (input as { readonly [field: string]: unknown })[key];
};

export const decodeRecordInvoiceExceptionRequest = (
  input: unknown
): Effect.Effect<
  RecordInvoiceExceptionRequest,
  InvoiceExceptionRefused | InvalidInvoiceRequest
> =>
  Effect.gen(function* decodeRecordInvoiceExceptionRequestGen() {
    const profileId = yield* Schema.decodeUnknownEffect(ProfileIdSchema)(
      fieldRaw(input, "profileId")
    ).pipe(
      Effect.mapError((failure) =>
        invalidInvoiceRequestOf(
          "recordInvoiceException",
          failure,
          fieldRaw(input, "profileId")
        )
      )
    );

    const transactionId = yield* Schema.decodeUnknownEffect(
      TransactionIdSchema
    )(fieldRaw(input, "transactionId")).pipe(
      Effect.mapError((failure) =>
        invalidInvoiceRequestOf(
          "recordInvoiceException",
          failure,
          fieldRaw(input, "transactionId")
        )
      )
    );

    const reasonRaw = fieldRaw(input, "reason");

    const reason = yield* Schema.decodeUnknownEffect(ExceptionReasonSchema)(
      reasonRaw
    ).pipe(
      Effect.mapError(() =>
        exceptionRefusalOf(profileId, transactionId, reasonRaw)
      )
    );

    return { profileId, reason, transactionId };
  });

export const decodeRegisterLegacyInvoicesRequest = (
  input: unknown
): Effect.Effect<
  RegisterLegacyInvoicesRequest,
  InvalidInvoiceRequest | LegacyFilesRefused
> => {
  if (Schema.is(RegisterLegacyInvoicesRequestSchema)(input)) {
    return Effect.succeed(input);
  }

  const parsed = Schema.decodeUnknownResult(
    RegisterLegacyInvoicesRequestSchema
  )(input);

  if (Result.isSuccess(parsed)) {
    return Effect.succeed(parsed.success);
  }

  const failure = parsed.failure;
  const profileId = profileIdFrom(input);
  const count = filesCountOf(input);

  if (profileId !== undefined && isBatchSizeIssue(failure, count)) {
    return Effect.fail(legacyRefusalOf(profileId, count));
  }

  return Effect.fail(
    invalidInvoiceRequestOf("registerLegacyInvoices", failure, input)
  );
};
