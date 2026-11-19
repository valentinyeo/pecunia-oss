import { ProfileIdSchema } from "@pecunia/access";
import type { ProfileId } from "@pecunia/access";
import type { Category } from "@pecunia/categorize";
import { Context, Effect, Layer, Schema } from "effect";

export interface CategoryStorePort {
  readonly list: (profileId: ProfileId) => Effect.Effect<readonly Category[]>;
}

export class CategoryStore extends Context.Service<
  CategoryStore,
  CategoryStorePort
>()("@pecunia/ai-tools/CategoryStore") {}

export const memoryCategoryStoreLayer = (
  categories: readonly Category[]
): Layer.Layer<CategoryStore> => {
  const known = categories.map((category) => ({
    category,
    profileId: Schema.decodeSync(ProfileIdSchema)(category.profileId),
  }));

  return Layer.succeed(CategoryStore, {
    list: (profileId) =>
      Effect.succeed(
        known.flatMap((entry) =>
          entry.profileId === profileId ? [entry.category] : []
        )
      ),
  });
};
