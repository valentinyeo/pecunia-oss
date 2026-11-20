import { CurrentPerson, Forbidden } from "@pecunia/access";
import { BankLineService } from "@pecunia/bank-lines";
import type {
  BankLineStoreError,
  CursorFilterMismatch,
  UnknownBankLine,
  UnknownCategory,
} from "@pecunia/bank-lines";
import {
  editBankLine,
  listBankLines,
  reviewBankLine,
} from "@pecunia/bank-lines/capabilities";
import {
  demoBankLines,
  demoCategories,
  demoPerson,
  demoProfileId,
} from "@pecunia/bank-lines/demo";
import { memoryBankLineStoreLayer } from "@pecunia/bank-lines/memory";
import {
  EditBankLineRequestSchema,
  ReviewBankLineRequestSchema,
  SEARCH_MAX_LENGTH,
  SearchTextSchema,
} from "@pecunia/bank-lines/model";
import type {
  BankLine,
  BankLineFilter,
  BankLinePage,
  LineEdit,
  LineReview,
} from "@pecunia/bank-lines/model";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { BankLinesGatewayFailure } from "./gateway-failure.js";

const SCREEN_PAGE_LIMIT = 50;

const storedLines = "reload the screen and try again";

type StoredFailure =
  | BankLineStoreError
  | CursorFilterMismatch
  | UnknownBankLine
  | UnknownCategory
  | Forbidden;

const repaired = (
  failure: StoredFailure | BankLinesGatewayFailure
): BankLinesGatewayFailure => {
  if (Schema.is(BankLinesGatewayFailure)(failure)) {
    return failure;
  }

  if (Schema.is(Forbidden)(failure)) {
    return new BankLinesGatewayFailure({
      cause: failure,
      message: `${failure.message}. Fix: ask an owner of this profile for access, then reload the screen.`,
    });
  }

  return new BankLinesGatewayFailure({
    cause: failure,
    message: `${failure.message} Fix: ${failure.repair}`,
  });
};

const refusedBeforeStore = (failure: Schema.SchemaError) =>
  new BankLinesGatewayFailure({
    cause: failure,
    message: `The bank lines request was refused before it reached the store. Fix: ${storedLines}.`,
  });

const refusedSearch = (failure: Schema.SchemaError, search: string) =>
  new BankLinesGatewayFailure({
    cause: failure,
    message:
      search.length > SEARCH_MAX_LENGTH
        ? `The search text is ${search.length} characters long and the limit is ${SEARCH_MAX_LENGTH}. Fix: shorten the search text and try again.`
        : `The bank lines request was refused before it reached the store. Fix: ${storedLines}.`,
  });

const decodeInput =
  <Output, Input>(schema: Schema.Codec<Output, Input>) =>
  (input: Input) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(refusedBeforeStore)
    );

export interface ListRequest {
  readonly filter: BankLineFilter;
  readonly search: string;
}

const demoWorld = Layer.mergeAll(
  BankLineService.layer.pipe(
    Layer.provide(
      memoryBankLineStoreLayer({
        categories: demoCategories,
        lines: demoBankLines,
      })
    )
  ),
  Layer.succeed(CurrentPerson, demoPerson)
);

export class BankLinesGateway extends Context.Service<
  BankLinesGateway,
  {
    readonly edit: (
      edit: LineEdit
    ) => Effect.Effect<BankLine, BankLinesGatewayFailure>;
    readonly list: (
      request: ListRequest
    ) => Effect.Effect<BankLinePage, BankLinesGatewayFailure>;
    readonly review: (
      review: LineReview
    ) => Effect.Effect<BankLine, BankLinesGatewayFailure>;
  }
>()("@pecunia/web/BankLinesGateway", {
  make: Effect.gen(function* makeBankLinesGateway() {
    const service = yield* BankLineService;
    const person = yield* CurrentPerson;

    const dependencies = Layer.mergeAll(
      Layer.succeed(BankLineService, service),
      Layer.succeed(CurrentPerson, person)
    );

    const list = (request: ListRequest) =>
      Schema.decodeEffect(SearchTextSchema)(request.search).pipe(
        Effect.mapError((failure) => refusedSearch(failure, request.search)),
        Effect.flatMap((search) =>
          listBankLines.handler({
            cursor: Option.none(),
            filter: request.filter,
            limit: SCREEN_PAGE_LIMIT,
            profileId: demoProfileId,
            search,
          })
        ),
        Effect.mapError(repaired),
        Effect.provide(dependencies)
      );

    const edit = (lineEdit: LineEdit) =>
      decodeInput(EditBankLineRequestSchema)({
        ...lineEdit,
        profileId: demoProfileId,
      }).pipe(
        Effect.flatMap((request) => editBankLine.handler(request)),
        Effect.mapError(repaired),
        Effect.provide(dependencies)
      );

    const review = (lineReview: LineReview) =>
      decodeInput(ReviewBankLineRequestSchema)({
        ...lineReview,
        profileId: demoProfileId,
      }).pipe(
        Effect.flatMap((request) => reviewBankLine.handler(request)),
        Effect.mapError(repaired),
        Effect.provide(dependencies)
      );

    return { edit, list, review } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(demoWorld)
  );
}
