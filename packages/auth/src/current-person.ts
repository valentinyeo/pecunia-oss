import type { PersonId } from "@pecunia/database";
import { Context } from "effect";

export class CurrentPerson extends Context.Service<CurrentPerson, PersonId>()(
  "@pecunia/auth/CurrentPerson"
) {}
