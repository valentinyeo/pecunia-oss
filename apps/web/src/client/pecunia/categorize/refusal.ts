import { Schema } from "effect";

export const RefusalReasonSchema = Schema.Literals([
  "aliasPayeeRequired",
  "categoryHasChildren",
  "duplicateAlias",
  "duplicateCategoryName",
  "merchantTaken",
  "parentCycle",
  "sameMerchant",
  "selfParent",
  "unknownAlias",
  "unknownCategory",
  "unknownMerchant",
  "unknownPayee",
  "unknownRule",
]);

export type RefusalReason = typeof RefusalReasonSchema.Type;

export class CatalogRefusal extends Schema.TaggedError<
  CatalogRefusal,
  { readonly brand: unique symbol }
>()("CatalogRefusal", {
  message: Schema.NonEmptyString,
  reason: RefusalReasonSchema,
}) {}

export const unknownCategory = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "No category with that id is in this book. Fix: reload `/app/categories` and pick a category from the list.",
    reason: "unknownCategory",
  });

export const unknownRule = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "No rule with that id is in this book. Fix: reload `/app/rules` and pick a rule from the list.",
    reason: "unknownRule",
  });

export const unknownAlias = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "No alias with that id is in this book. Fix: reload `/app/aliases` and pick an alias from the list.",
    reason: "unknownAlias",
  });

export const unknownPayee = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "That merchant is not in this book. Fix: search a merchant name in `/app/aliases` and pick a match.",
    reason: "unknownPayee",
  });

export const unknownMerchant = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "That merchant has no payments in this book. Fix: reload `/app/merchants` and pick a merchant from the list.",
    reason: "unknownMerchant",
  });

export const selfParent = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "A category cannot be its own parent. Fix: pick another parent in `/app/categories`.",
    reason: "selfParent",
  });

export const parentCycle = (parentName: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `\`${parentName}\` sits inside this category, so the tree would loop. Fix: pick a category outside it in \`/app/categories\`.`,
    reason: "parentCycle",
  });

export const categoryHasChildren = (
  name: string,
  children: number
): CatalogRefusal =>
  new CatalogRefusal({
    message: `\`${name}\` holds ${children === 1 ? "one child category" : `${children} child categories`}. Fix: delete or move its children in \`/app/categories\` first.`,
    reason: "categoryHasChildren",
  });

export const duplicateCategoryName = (name: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `A category called \`${name}\` already exists. Fix: use another name in \`/app/categories\`.`,
    reason: "duplicateCategoryName",
  });

export const duplicateAlias = (pattern: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `The pattern \`${pattern}\` is already an alias. Fix: edit that alias in \`/app/aliases\`.`,
    reason: "duplicateAlias",
  });

export const merchantTaken = (name: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `A merchant called \`${name}\` is already in this book. Fix: pick it from the matches in \`/app/aliases\`, or merge the two there.`,
    reason: "merchantTaken",
  });

export const sameMerchant = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "A merchant cannot be merged into itself. Fix: pick a different merchant in `/app/aliases`.",
    reason: "sameMerchant",
  });

export const aliasPayeeRequired = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "An alias needs a merchant to mean. Fix: search a merchant name in `/app/aliases` and pick a match.",
    reason: "aliasPayeeRequired",
  });
