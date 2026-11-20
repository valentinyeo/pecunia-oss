import { Effect } from "effect";
import { Command } from "foldkit";

import { CategorizeGateway } from "./gateway.js";
import { FormSlotSchema, Message } from "./message.js";
import type { FormSlot } from "./message.js";
import { CatalogWriteSchema } from "./write.js";
import type { CatalogWrite } from "./write.js";

export const WriteCatalog = Command.define("WriteCatalog", {
  args: { form: FormSlotSchema, write: CatalogWriteSchema },
  execute: ({
    form,
    write,
  }: Readonly<{ form: FormSlot; write: CatalogWrite }>) =>
    CategorizeGateway.use((gateway) => gateway.write(write)).pipe(
      Effect.match({
        onFailure: (refusal) =>
          Message.FailedWrite({ reason: refusal.message }),
        onSuccess: ({ catalog, notice }) =>
          Message.CompletedWrite({ catalog, form, notice }),
      })
    ),
  messages: [Message.CompletedWrite, Message.FailedWrite],
});
