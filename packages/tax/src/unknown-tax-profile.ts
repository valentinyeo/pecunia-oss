import type { ProfileId, TaxProfileId } from "@pecunia/core/model";
import { Schema } from "effect";

import { ProfileIdSchema, TaxProfileIdSchema } from "./model.js";

export class UnknownTaxProfile extends Schema.TaggedError<
  UnknownTaxProfile,
  { readonly brand: unique symbol }
>()("UnknownTaxProfile", {
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  taxProfileId: TaxProfileIdSchema,
}) {}

export const unknownTaxProfile = (input: {
  readonly profileId: ProfileId;
  readonly taxProfileId: TaxProfileId;
}): UnknownTaxProfile =>
  new UnknownTaxProfile({
    message: `Tax profile ${input.taxProfileId} is not in profile ${input.profileId}.`,
    profileId: input.profileId,
    repair:
      "Sync a tax profile returned by `listTaxDues` for this profile, or create one first.",
    taxProfileId: input.taxProfileId,
  });
