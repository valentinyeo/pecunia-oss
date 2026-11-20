import { CategoryIdSchema } from "@pecunia/bank-lines/model";
import type { CategoryId } from "@pecunia/bank-lines/model";
import { Option, Schema } from "effect";

export const CategoryChoice = Schema.Struct({
  id: CategoryIdSchema,
  name: Schema.NonEmptyString,
});

export type CategoryChoiceValue = typeof CategoryChoice.Type;

export const demoCatalogue: readonly CategoryChoiceValue[] = Schema.decodeSync(
  Schema.Array(CategoryChoice)
)([
  { id: "0192f0c1-000d-75e9-8fd7-fd7e43c901ee", name: "Office" },
  { id: "0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba", name: "Software" },
  { id: "0192f0c1-000f-755b-8ae4-ae47d20b52cf", name: "Design tools" },
  { id: "0192f0c1-0010-744d-827c-27cf38c20ebb", name: "Travel" },
  { id: "0192f0c1-0011-79f9-8c9a-c9af5a7eff0d", name: "Eating out" },
  { id: "0192f0c1-0013-703c-80e5-0e5bbe77367b", name: "Income" },
]);

export const uncategorisedName = "No category";

export const categoryNameOf = (
  catalogue: readonly CategoryChoiceValue[],
  category: Option.Option<CategoryId>
): string =>
  Option.match(category, {
    onNone: () => uncategorisedName,
    onSome: (categoryId) =>
      catalogue.find((choice) => choice.id === categoryId)?.name ??
      "Unnamed category",
  });
