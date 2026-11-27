import {
  ImportTargetSchema,
  ImportUnavailable,
} from "@pecunia/core/bank-import";
import type {
  ImportTarget,
  ProviderAccountId,
} from "@pecunia/core/bank-import";
import type { ProfileId } from "@pecunia/core/settings";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, Effect, Layer, Option, Schema } from "effect";

import { ImportLedger } from "./import-ledger.js";
import type { RecordedLines } from "./import-ledger.js";
import { FingerprintedLineSchema } from "./line.js";
import type { FingerprintedLine } from "./line.js";

const TargetRowSchema = Schema.Struct({
  base_currency: Schema.String,
  id: Schema.String,
  kind: Schema.String,
  label: Schema.String,
  profile_id: Schema.String,
  provider_label: Schema.String,
});

const StoredTransactionRowSchema = Schema.Struct({
  direction: Schema.String,
  external_id: Schema.String,
  raw_description: Schema.String,
  raw_reference: Schema.String,
  source_currency: Schema.String,
  source_minor: Schema.Int,
  value_date: Schema.String,
});

const TIMESTAMP_BYTES = 6;

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const newTransactionId = (millis: number): string => {
  const bytes = new Uint8Array(16);

  globalThis.crypto.getRandomValues(bytes);

  const stamp = BigInt(millis);

  for (let index = 0; index < TIMESTAMP_BYTES; index += 1) {
    bytes[index] = Number(
      (stamp / 2n ** BigInt(8 * (TIMESTAMP_BYTES - 1 - index))) % 256n
    );
  }

  bytes[6] = ((bytes[6] ?? 0) % 16) + 0x70;
  bytes[8] = ((bytes[8] ?? 0) % 64) + 0x80;

  const hex = hexOf(bytes);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const importFailed =
  (operation: "listTargets" | "record") =>
  (cause: SqliteClientError | Error): ImportUnavailable =>
    new ImportUnavailable({ cause, operation });

const decodeTarget = (
  row: typeof TargetRowSchema.Type
): Effect.Effect<ImportTarget, ImportUnavailable> =>
  Schema.decodeUnknownEffect(ImportTargetSchema)({
    baseCurrency: row.base_currency,
    id: row.id,
    kind: row.kind,
    label: row.label,
    profileId: row.profile_id,
    providerLabel: row.provider_label,
  }).pipe(Effect.mapError(importFailed("listTargets")));

const directionOf = (amountMinor: number): "in" | "neutral" | "out" => {
  if (amountMinor < 0) {
    return "out";
  }

  if (amountMinor > 0) {
    return "in";
  }

  return "neutral";
};

const TARGET_SELECT = `SELECT
  pa.id AS id,
  pa.profile_id AS profile_id,
  pa.kind AS kind,
  pa.label AS label,
  pr.label AS provider_label,
  pf.base_currency AS base_currency
FROM provider_accounts pa
INNER JOIN providers pr ON pr.id = pa.provider_id
INNER JOIN profiles pf ON pf.id = pa.profile_id
WHERE pa.profile_id = ?
  AND pa.archived_at IS NULL
  AND pf.archived_at IS NULL
  AND pa.kind IN ('bank', 'csv')`;

export const d1ImportLedgerLayer = Layer.effect(
  ImportLedger,
  Effect.gen(function* makeD1ImportLedger() {
    const client = yield* SqliteClient;

    const listTargets = Effect.fn("D1ImportLedger.listTargets")(
      function* listTargets(profileId: ProfileId) {
        const rows = yield* client
          .query(
            `${TARGET_SELECT} ORDER BY pa.label ASC, pa.id ASC`,
            [profileId],
            TargetRowSchema
          )
          .pipe(Effect.mapError(importFailed("listTargets")));

        const targets: ImportTarget[] = [];

        for (const row of rows) {
          targets.push(yield* decodeTarget(row));
        }

        return targets;
      }
    );

    const findTarget = Effect.fn("D1ImportLedger.findTarget")(
      function* findTarget(profileId: ProfileId, accountId: ProviderAccountId) {
        const rows = yield* client
          .query(
            `${TARGET_SELECT} AND pa.id = ?`,
            [profileId, accountId],
            TargetRowSchema
          )
          .pipe(Effect.mapError(importFailed("listTargets")));

        const [first] = rows;

        if (first === undefined) {
          return Option.none<ImportTarget>();
        }

        return Option.some(yield* decodeTarget(first));
      }
    );

    const record = Effect.fn("D1ImportLedger.record")(function* record(
      profileId: ProfileId,
      accountId: ProviderAccountId,
      lines: readonly FingerprintedLine[]
    ) {
      const now = yield* Clock.currentTimeMillis;

      let imported = 0;

      let alreadyImported = 0;

      for (const line of lines) {
        const occurredAt = Date.parse(`${line.date}T12:00:00.000Z`);

        const minor = Math.abs(line.amountMinor);

        const direction = directionOf(line.amountMinor);

        const outcome = yield* client
          .execute(
            `INSERT OR IGNORE INTO transactions (
              id, profile_id, provider_account_id, external_id, status, direction,
              occurred_at, value_date, source_minor, source_currency,
              base_minor, base_currency, raw_merchant, raw_reference, raw_description,
              note, categorization, classification, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'none', 'none', ?, ?)`,
            [
              newTransactionId(now),
              profileId,
              accountId,
              line.fingerprint,
              direction,
              occurredAt,
              line.date,
              minor,
              line.currency,
              minor,
              line.currency,
              line.description,
              line.reference,
              line.description,
              now,
              now,
            ]
          )
          .pipe(Effect.mapError(importFailed("record")));

        if (outcome.changes > 0) {
          imported += 1;
        } else {
          alreadyImported += 1;
        }
      }

      const summary: RecordedLines = { alreadyImported, imported };

      return summary;
    });

    const storedLines = Effect.fn("D1ImportLedger.storedLines")(
      function* storedLines(
        profileId: ProfileId,
        accountId: ProviderAccountId
      ) {
        const rows = yield* client.query(
          `SELECT external_id, value_date, raw_description, raw_reference, source_minor, source_currency, direction
           FROM transactions
           WHERE profile_id = ? AND provider_account_id = ? AND external_id LIKE 'csv-%'
           ORDER BY value_date ASC, id ASC`,
          [profileId, accountId],
          StoredTransactionRowSchema
        );

        const decoded: FingerprintedLine[] = [];

        for (const row of rows) {
          const signedMinor =
            row.direction === "out" ? -row.source_minor : row.source_minor;

          decoded.push(
            yield* Schema.decodeEffect(FingerprintedLineSchema)({
              amountMinor: signedMinor,
              currency: row.source_currency,
              date: row.value_date,
              description: row.raw_description,
              fingerprint: row.external_id,
              reference: row.raw_reference,
            })
          );
        }

        return decoded;
      },
      Effect.mapError(importFailed("record"))
    );

    return ImportLedger.of({
      findTarget,
      listTargets,
      record,
      storedLines,
    });
  })
);
