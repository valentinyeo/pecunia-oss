import { Effect, Option, Result, Schema } from "effect";

import type { Cursor, RawProviderLine, RawProviderPage } from "./model.js";
import { CursorSchema } from "./model.js";
import { ProviderUnavailable } from "./provider-unavailable.js";
import type { BankProviderService } from "./provider.js";

const WiseActivitySchema = Schema.Struct({
  amountMinor: Schema.Finite,
  bookingDate: Schema.String,
  currency: Schema.String,
  description: Schema.String,
  id: Schema.String,
});

export const WiseRecordedPageSchema = Schema.Struct({
  activities: Schema.Array(WiseActivitySchema),
  nextCursor: Schema.NullOr(CursorSchema),
});

export type WiseRecordedPage = typeof WiseRecordedPageSchema.Type;

export const WiseFixtureInvalidSchema = Schema.TaggedStruct(
  "WiseFixtureInvalid",
  {
    page: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    reason: Schema.String,
  }
);

export type WiseFixtureInvalid = typeof WiseFixtureInvalidSchema.Type;

type WiseActivity = (typeof WiseActivitySchema)["Type"];

export interface WiseRawPage {
  readonly lines: readonly RawProviderLine[];
  readonly nextCursor: Cursor | null;
}

const toRawLine = (activity: WiseActivity): RawProviderLine => ({
  amountMinor: activity.amountMinor,
  bookedOn: activity.bookingDate,
  currency: activity.currency,
  description: activity.description,
  providerLineId: activity.id,
});

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- A recorded provider response is unparsed JSON; this is the boundary where that JSON becomes a page.
export const parseWiseRecordedPage = (
  recorded: unknown, // oxlint-disable-line anti-slop/no-unknown-parameters -- Unparsed recorded response, decoded by the schema below.
  page: number
): Result.Result<WiseRawPage, WiseFixtureInvalid> =>
  Option.match(Schema.decodeUnknownOption(WiseRecordedPageSchema)(recorded), {
    onNone: () =>
      Result.fail(
        WiseFixtureInvalidSchema.make({
          page,
          reason: "Recorded Wise page does not match the fixture schema",
        })
      ),
    onSome: (parsed) =>
      Result.succeed({
        lines: parsed.activities.map(toRawLine),
        nextCursor: parsed.nextCursor,
      }),
  });

const pagesByCursor = (
  recorded: readonly unknown[]
): Result.Result<
  ReadonlyMap<Cursor | null, RawProviderPage>,
  WiseFixtureInvalid
> => {
  const pages = new Map<Cursor | null, RawProviderPage>();
  let requestCursor: Cursor | null = null;

  for (const [index, entry] of recorded.entries()) {
    const parsed = parseWiseRecordedPage(entry, index);

    if (Result.isFailure(parsed)) {
      return Result.fail(parsed.failure);
    }

    pages.set(requestCursor, parsed.success);
    requestCursor = parsed.success.nextCursor;
  }

  return Result.succeed(pages);
};

export const wiseRecordedProvider = (
  recorded: readonly unknown[]
): Result.Result<BankProviderService, WiseFixtureInvalid> =>
  Result.map(pagesByCursor(recorded), (pages) => ({
    fetchPage: (request) =>
      Option.match(Option.fromNullishOr(pages.get(request.cursor)), {
        onNone: () =>
          ProviderUnavailable.make({
            reason: "Wise recording has no page for this cursor",
          }),
        onSome: (page) => Effect.succeed(page),
      }),
  }));
