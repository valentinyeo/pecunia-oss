import { Context } from "effect";
import type { Effect } from "effect";

import type { BankLineStoreError } from "./bank-line-store-error.js";
import type { BankLine, CategoryId, ProfileId } from "./model.js";

export class BankLineStore extends Context.Service<
  BankLineStore,
  {
    readonly categories: (
      profileId: ProfileId
    ) => Effect.Effect<readonly CategoryId[], BankLineStoreError>;
    readonly lines: (
      profileId: ProfileId
    ) => Effect.Effect<readonly BankLine[], BankLineStoreError>;
    readonly save: (
      line: BankLine
    ) => Effect.Effect<BankLine, BankLineStoreError>;
  }
>()("@pecunia/bank-lines/BankLineStore") {}
