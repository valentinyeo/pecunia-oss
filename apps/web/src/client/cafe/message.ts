import { CafeLetter } from "@pecunia/core/contracts";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  ClearedStackLetters: {},
  ToggledStackLetter: { letter: CafeLetter },
});

export type CafeMessage = typeof Message.Type;
