import { Layer } from "effect";

import { PersonSchema } from "./model.js";
import type { Person } from "./model.js";
import { CurrentPerson } from "./person.js";

export const testPersonLayer = (person: Person) =>
  Layer.succeed(CurrentPerson, person);

export const runAsPerson = {
  label: "person",
  schema: PersonSchema,
  tag: CurrentPerson,
} as const;
