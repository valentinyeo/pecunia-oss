import { Effect, Match, Option, Result, Schema, SchemaIssue } from "effect";

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
} from "./model.js";
import type {
  ProfileId,
  RecordInvoiceExceptionRequest,
  RegisterLegacyInvoicesRequest,
} from "./model.js";

const schemaIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const pathKey = (
  segment: PropertyKey | { readonly key: PropertyKey }
): PropertyKey =>
  Match.value(segment).pipe(
    Match.when({ key: Match.any }, (value) => value.key),
    Match.orElse((value) => value)
  );

const fieldOf = (
  path: readonly (PropertyKey | { readonly key: PropertyKey })[]
): string => path.map((segment) => String(pathKey(segment))).join(".");

export const invalidInvoiceRequestOf = (
  capability: string,
  failure: Schema.SchemaError
): InvalidInvoiceRequest => {
  const [first] = schemaIssueFormatter(failure.issue).issues;
  const path = first?.path ?? [];
  const field = path.length === 0 ? capability : fieldOf(path);
  const problem = first?.message ?? failure.message;
  const fix = `Fix: correct ${field} and send the request again.`;

  return new InvalidInvoiceRequest({ capability, field, fix, problem });
};

export const decodeInvoiceRequest = <S extends Schema.Constraint>(
  capability: string,
  schema: S,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Capability handlers receive wire JSON before the contract schema decodes it.
  input: unknown
): Effect.Effect<S["Type"], InvalidInvoiceRequest, S["DecodingServices"]> => {
  if (Schema.is(schema)(input)) {
    // SAFETY: Schema.is narrows input to S["Type"] when it returns true.
    return Effect.succeed(input);
  }

  // @effect-diagnostics-next-line preferTypedSchemaDecoder:off -- handlers accept wire JSON the contract schema decodes at this boundary.
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((failure) => invalidInvoiceRequestOf(capability, failure))
  );
};

const ProfileIdFieldSchema = Schema.Struct({ profileId: ProfileIdSchema });

const TransactionIdFieldSchema = Schema.Struct({
  transactionId: TransactionIdSchema,
});

const ExceptionInputSchema = Schema.Struct({
  profileId: Schema.Unknown,
  reason: Schema.Unknown,
  transactionId: Schema.Unknown,
});

const LegacyProfileProbeSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

const LegacyFilesProbeSchema = Schema.Struct({
  files: Schema.Array(Schema.Unknown),
});

const isBatchSizeIssue = (
  failure: Schema.SchemaError,
  count: number
): boolean => {
  const [first] = schemaIssueFormatter(failure.issue).issues;
  const field = first === undefined ? "" : fieldOf(first?.path ?? []);

  if (count > LEGACY_FILES_MAX || count === 0) {
    return field === "files" || field.startsWith("files.");
  }

  return field === "files";
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

const exceptionRefusalOf = (
  profileId: ProfileId,
  transactionId: typeof TransactionIdSchema.Type,
  reason: typeof Schema.Unknown.Type
): InvoiceExceptionRefused => {
  const reasonLength = Schema.decodeUnknownOption(Schema.String)(reason).pipe(
    Option.map((text) => text.trim().length),
    Option.getOrElse(() => 0)
  );

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

export const decodeRecordInvoiceExceptionRequest = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Capability handlers receive wire JSON before the contract schema decodes it.
  input: unknown
): Effect.Effect<
  RecordInvoiceExceptionRequest,
  InvoiceExceptionRefused | InvalidInvoiceRequest
> =>
  Effect.gen(function* decodeRecordInvoiceExceptionRequestGen() {
    const envelope = yield* Schema.decodeUnknownEffect(ExceptionInputSchema)(
      input
    ).pipe(
      Effect.mapError((failure) =>
        invalidInvoiceRequestOf("recordInvoiceException", failure)
      )
    );

    const { profileId } = yield* Schema.decodeUnknownEffect(
      ProfileIdFieldSchema
    )({ profileId: envelope.profileId }).pipe(
      Effect.mapError((failure) =>
        invalidInvoiceRequestOf("recordInvoiceException", failure)
      )
    );

    const { transactionId } = yield* Schema.decodeUnknownEffect(
      TransactionIdFieldSchema
    )({ transactionId: envelope.transactionId }).pipe(
      Effect.mapError((failure) =>
        invalidInvoiceRequestOf("recordInvoiceException", failure)
      )
    );

    const reason = yield* Schema.decodeUnknownEffect(ExceptionReasonSchema)(
      envelope.reason
    ).pipe(
      Effect.mapError(() =>
        exceptionRefusalOf(profileId, transactionId, envelope.reason)
      )
    );

    return { profileId, reason, transactionId };
  });

export const decodeRegisterLegacyInvoicesRequest = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Capability handlers receive wire JSON before the contract schema decodes it.
  input: unknown
): Effect.Effect<
  RegisterLegacyInvoicesRequest,
  InvalidInvoiceRequest | LegacyFilesRefused
> => {
  if (Schema.is(RegisterLegacyInvoicesRequestSchema)(input)) {
    // SAFETY: Schema.is narrows input to RegisterLegacyInvoicesRequest when it returns true.
    return Effect.succeed(input);
  }

  const parsed = Schema.decodeUnknownResult(
    RegisterLegacyInvoicesRequestSchema
  )(input);

  if (Result.isSuccess(parsed)) {
    return Effect.succeed(parsed.success);
  }

  const profileId = Schema.decodeUnknownOption(LegacyProfileProbeSchema)(
    input
  ).pipe(
    Option.map((row) => row.profileId),
    Option.getOrUndefined
  );

  const count = Schema.decodeUnknownOption(LegacyFilesProbeSchema)(input).pipe(
    Option.map((row) => row.files.length),
    Option.getOrElse(() => 0)
  );

  const { failure } = parsed;

  if (profileId !== undefined && isBatchSizeIssue(failure, count)) {
    return Effect.fail(legacyRefusalOf(profileId, count));
  }

  return Effect.fail(
    invalidInvoiceRequestOf("registerLegacyInvoices", failure)
  );
};
