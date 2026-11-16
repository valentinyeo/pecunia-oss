import { Context, Effect, Layer, Result, Schema } from "effect";

export const RetryPolicySchema = Schema.Struct({
  attempts: Schema.Int.check(Schema.isBetween({ maximum: 10, minimum: 1 })),
  delayMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type RetryPolicy = typeof RetryPolicySchema.Type;

export interface RetryableFailure {
  readonly reason: string;
}

export interface RetryClockService {
  readonly sleep: (millis: number) => Effect.Effect<void>;
}

export class RetryClock extends Context.Service<
  RetryClock,
  RetryClockService
>()("@pecunia/bank-sync/RetryClock") {}

export const retryClockLive = Layer.succeed(RetryClock, {
  sleep: (millis) => Effect.sleep(millis),
});

export interface StepOutcome<A> {
  readonly attempts: number;
  readonly result: Result.Result<A, string>;
}

export const retryStep = <A>(
  policy: RetryPolicy,
  attempt: () => Effect.Effect<A, RetryableFailure>
): Effect.Effect<StepOutcome<A>, never, RetryClock> =>
  Effect.gen(function* retryBounded() {
    const clock = yield* RetryClock;
    let attempts = 0;
    let reason = "Step was never attempted";

    while (attempts < policy.attempts) {
      attempts += 1;

      const result = yield* Effect.result(attempt());

      if (Result.isSuccess(result)) {
        return { attempts, result: Result.succeed(result.success) };
      }

      const { failure } = result;

      const { reason: failureReason } = failure;

      reason = failureReason;

      if (attempts < policy.attempts) {
        yield* clock.sleep(policy.delayMillis);
      }
    }

    return { attempts, result: Result.fail(reason) };
  });
