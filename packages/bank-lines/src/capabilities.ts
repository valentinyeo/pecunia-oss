import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  editBankLineContract,
  listBankLinesContract,
  reviewBankLineContract,
} from "./contracts.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { BankLineService } from "./service.js";

export const listBankLines = implement(
  listBankLinesContract,
  ({ cursor, filter, limit, profileId, search }) =>
    Effect.gen(function* listProfileBankLines() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* BankLineService;

      return yield* service.list(scope, { cursor, filter, limit, search });
    })
);

export const editBankLine = implement(
  editBankLineContract,
  ({ category, lineId, note, profileId }) =>
    Effect.gen(function* editProfileBankLine() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* BankLineService;

      return yield* service.edit(scope, { category, lineId, note });
    })
);

export const reviewBankLine = implement(
  reviewBankLineContract,
  ({ lineId, profileId }) =>
    Effect.gen(function* reviewProfileBankLine() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* BankLineService;

      return yield* service.review(scope, { lineId });
    })
);

export const bankLineCapabilities = [
  listBankLines,
  editBankLine,
  reviewBankLine,
] as const;
