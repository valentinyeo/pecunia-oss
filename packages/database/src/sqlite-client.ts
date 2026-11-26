import { Context, Effect, Layer, pipe, Schema } from "effect";

import { SqliteClientError } from "./sqlite-client-error.js";

export { SqliteClientError } from "./sqlite-client-error.js";

export const SqlValueSchema = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Null,
]);

export type SqlValue = typeof SqlValueSchema.Type;

export interface SqlStatement {
  readonly params: readonly SqlValue[];
  readonly sql: string;
}

export interface SqliteRunResult {
  readonly changes: number;
}

export class SqliteClient extends Context.Service<
  SqliteClient,
  {
    readonly batch: (
      statements: readonly SqlStatement[]
    ) => Effect.Effect<readonly SqliteRunResult[], SqliteClientError>;
    readonly execute: (
      sql: string,
      params?: readonly SqlValue[]
    ) => Effect.Effect<SqliteRunResult, SqliteClientError>;
    readonly query: <Row>(
      sql: string,
      params: readonly SqlValue[],
      rowSchema: Schema.Decoder<Row>
    ) => Effect.Effect<readonly Row[], SqliteClientError>;
  }
>()("@pecunia/database/SqliteClient") {}

export interface D1PreparedLike {
  readonly all: () => Promise<{ readonly results: readonly object[] }>;
  readonly bind: (...values: readonly SqlValue[]) => D1PreparedLike;
  readonly run: () => Promise<{
    readonly meta?: { readonly changes?: number } | undefined;
  }>;
}

export interface D1DatabaseLike {
  readonly batch: (statements: readonly D1PreparedLike[]) => Promise<
    readonly {
      readonly meta?: { readonly changes?: number } | undefined;
    }[]
  >;
  readonly prepare: (sql: string) => D1PreparedLike;
}

export interface NodeSqliteStatementLike {
  readonly all: (...params: readonly SqlValue[]) => readonly object[];
  readonly run: (...params: readonly SqlValue[]) => {
    readonly changes: number | bigint;
  };
}

export interface NodeSqliteDatabaseLike {
  readonly exec: (sql: string) => void;
  readonly prepare: (sql: string) => NodeSqliteStatementLike;
}

export interface SqlJsStatementLike {
  readonly bind: (params: readonly SqlValue[]) => boolean;
  readonly free: () => boolean;
  readonly getAsObject: () => object;
  readonly step: () => boolean;
}

export interface SqlJsDatabaseLike {
  readonly getRowsModified: () => number;
  readonly prepare: (sql: string) => SqlJsStatementLike;
  readonly run: (
    sql: string,
    params?: readonly SqlValue[]
  ) => SqlJsDatabaseLike;
}

const decodeRows = <Row>(
  sql: string,
  rows: readonly object[],
  rowSchema: Schema.Decoder<Row>
): Effect.Effect<readonly Row[], SqliteClientError> =>
  pipe(
    rows,
    Effect.forEach((row) =>
      // @effect-diagnostics-next-line preferTypedSchemaDecoder:off -- Raw driver rows are plain objects validated against rowSchema at the SQLite boundary.
      Schema.decodeUnknownEffect(rowSchema)(row).pipe(
        Effect.mapError(
          (cause) =>
            new SqliteClientError({
              cause,
              operation: "query",
              sql,
            })
        )
      )
    )
  );

export const d1SqliteClientLayer = (database: D1DatabaseLike) =>
  Layer.succeed(
    SqliteClient,
    SqliteClient.of({
      batch: (statements) =>
        Effect.tryPromise({
          catch: (cause) =>
            new SqliteClientError({
              cause,
              operation: "batch",
              sql: statements.map((statement) => statement.sql).join("; "),
            }),
          try: () =>
            database.batch(
              statements.map((statement) =>
                database.prepare(statement.sql).bind(...statement.params)
              )
            ),
        }).pipe(
          Effect.map((results) =>
            results.map((result) => ({
              changes: result.meta?.changes ?? 0,
            }))
          )
        ),
      execute: (sql, params = []) =>
        Effect.tryPromise({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "execute", sql }),
          try: () =>
            database
              .prepare(sql)
              .bind(...params)
              .run(),
        }).pipe(
          Effect.map((result) => ({
            changes: result.meta?.changes ?? 0,
          }))
        ),
      query: (sql, params, rowSchema) =>
        Effect.tryPromise({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "query", sql }),
          try: () =>
            database
              .prepare(sql)
              .bind(...params)
              .all(),
        }).pipe(
          Effect.flatMap((result) => decodeRows(sql, result.results, rowSchema))
        ),
    })
  );

export const nodeSqliteClientLayer = (database: NodeSqliteDatabaseLike) =>
  Layer.succeed(
    SqliteClient,
    SqliteClient.of({
      batch: (statements) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({
              cause,
              operation: "batch",
              sql: statements.map((statement) => statement.sql).join("; "),
            }),
          try: () => {
            database.exec("BEGIN");

            try {
              const results: SqliteRunResult[] = [];

              for (const statement of statements) {
                const outcome = database
                  .prepare(statement.sql)
                  .run(...statement.params);

                results.push({ changes: Number(outcome.changes) });
              }

              database.exec("COMMIT");

              return results;
            } catch (error) {
              database.exec("ROLLBACK");

              throw error;
            }
          },
        }),
      execute: (sql, params = []) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "execute", sql }),
          try: () => {
            const outcome = database.prepare(sql).run(...params);

            return { changes: Number(outcome.changes) };
          },
        }),
      query: (sql, params, rowSchema) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "query", sql }),
          try: () => database.prepare(sql).all(...params),
        }).pipe(Effect.flatMap((rows) => decodeRows(sql, rows, rowSchema))),
    })
  );

export const sqlJsSqliteClientLayer = (database: SqlJsDatabaseLike) =>
  Layer.succeed(
    SqliteClient,
    SqliteClient.of({
      batch: (statements) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({
              cause,
              operation: "batch",
              sql: statements.map((statement) => statement.sql).join("; "),
            }),
          try: () => {
            database.run("BEGIN");

            try {
              const results: SqliteRunResult[] = [];

              for (const statement of statements) {
                database.run(statement.sql, statement.params);
                results.push({ changes: database.getRowsModified() });
              }

              database.run("COMMIT");

              return results;
            } catch (error) {
              database.run("ROLLBACK");

              throw error;
            }
          },
        }),
      execute: (sql, params = []) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "execute", sql }),
          try: () => {
            database.run(sql, params);

            return { changes: database.getRowsModified() };
          },
        }),
      query: (sql, params, rowSchema) =>
        Effect.try({
          catch: (cause) =>
            new SqliteClientError({ cause, operation: "query", sql }),
          try: () => {
            const statement = database.prepare(sql);

            try {
              statement.bind(params);

              const rows: object[] = [];

              while (statement.step()) {
                rows.push(statement.getAsObject());
              }

              return rows;
            } finally {
              statement.free();
            }
          },
        }).pipe(Effect.flatMap((rows) => decodeRows(sql, rows, rowSchema))),
    })
  );
