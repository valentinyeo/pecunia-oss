import { Schema } from "effect";

import { DisplayNameSchema } from "./amount.js";
import { CategoryIdSchema, ProfileIdSchema } from "./ids.js";

export const SpendingTypeSchema = Schema.Literals([
  "business",
  "mixed",
  "personal",
]);

export type SpendingType = typeof SpendingTypeSchema.Type;

interface ParentedCategory {
  readonly id: string;
  readonly parentId: string | null;
}

const parentIsAnotherCategory = Schema.makeFilter<ParentedCategory>(
  (category) => category.parentId === null || category.parentId !== category.id,
  { expected: "a parent other than the category itself" }
);

export const CategorySchema = Schema.Struct({
  archived: Schema.Boolean,
  color: DisplayNameSchema,
  id: CategoryIdSchema,
  name: DisplayNameSchema,
  parentId: Schema.NullOr(CategoryIdSchema),
  profileId: ProfileIdSchema,
  spendingType: SpendingTypeSchema,
}).check(parentIsAnotherCategory);

export type Category = typeof CategorySchema.Type;
