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
      "No category with that id is in this book. The page was loaded before the book changed, so the id points at nothing. Fix: reload `/app/categories` and pick a category from the list.",
    reason: "unknownCategory",
  });

export const unknownRule = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "No rule with that id is in this book. The page was loaded before the book changed, so the id points at nothing. Fix: reload `/app/rules` and pick a rule from the list.",
    reason: "unknownRule",
  });

export const unknownAlias = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "No alias with that id is in this book. The page was loaded before the book changed, so the id points at nothing. Fix: reload `/app/aliases` and pick an alias from the list.",
    reason: "unknownAlias",
  });

export const unknownPayee = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "That merchant is not in this book. An alias can only mean a merchant the book already holds. Fix: search a merchant name in `/app/aliases` and pick a match.",
    reason: "unknownPayee",
  });

export const unknownMerchant = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "That merchant has no payments in this book. A merchant row only exists while payments carry its name. Fix: reload `/app/merchants` and pick a merchant from the list.",
    reason: "unknownMerchant",
  });

export const selfParent = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "That category cannot be its own parent. A category above itself would loop the tree. Fix: pick another parent in `/app/categories`.",
    reason: "selfParent",
  });

export const parentCycle = (parentName: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `\`${parentName}\` sits inside this category, so the tree would loop. A category cannot move under its own child. Fix: pick a category outside it in \`/app/categories\`.`,
    reason: "parentCycle",
  });

export const categoryHasChildren = (
  name: string,
  children: number
): CatalogRefusal =>
  new CatalogRefusal({
    message: `\`${name}\` holds ${children === 1 ? "one child category" : `${children} child categories`}. Deleting it would leave them without a parent. Fix: delete or move its children in \`/app/categories\` first.`,
    reason: "categoryHasChildren",
  });

export const duplicateCategoryName = (name: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `A category called \`${name}\` already exists. Two categories with one name would be hard to tell apart. Fix: use another name in \`/app/categories\`.`,
    reason: "duplicateCategoryName",
  });

export const duplicateAlias = (pattern: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `The pattern \`${pattern}\` is already an alias. Two aliases on one pattern would fight over the merchant. Fix: edit that alias in \`/app/aliases\`.`,
    reason: "duplicateAlias",
  });

export const merchantTaken = (name: string): CatalogRefusal =>
  new CatalogRefusal({
    message: `A merchant called \`${name}\` is already in this book. Two merchants with one name would split its payments. Fix: pick it from the matches in \`/app/aliases\`, or merge the two there.`,
    reason: "merchantTaken",
  });

export const sameMerchant = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "A merchant cannot be merged into itself. A merge keeps one row, so the two sides must differ. Fix: pick a different merchant in `/app/aliases`.",
    reason: "sameMerchant",
  });

export const aliasPayeeRequired = (): CatalogRefusal =>
  new CatalogRefusal({
    message:
      "The alias has no merchant to mean. An alias maps a pattern to a merchant, so both are needed. Fix: search a merchant name in `/app/aliases` and pick a match.",
    reason: "aliasPayeeRequired",
  });

export const catalogRefusalSamples: readonly CatalogRefusal[] = [
  aliasPayeeRequired(),
  categoryHasChildren("Living", 2),
  duplicateAlias("DEMO GROC"),
  duplicateCategoryName("Groceries"),
  merchantTaken("Demo Grocer"),
  parentCycle("Living"),
  sameMerchant(),
  selfParent(),
  unknownAlias(),
  unknownCategory(),
  unknownMerchant(),
  unknownPayee(),
  unknownRule(),
];
