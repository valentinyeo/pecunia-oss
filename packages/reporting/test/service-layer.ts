import type { Person } from "@pecunia/access";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import { Layer, Schema } from "effect";

import {
  demoPerson,
  demoProfileId,
  demoReportSeed,
  secondProfileId,
} from "../src/demo.js";
import { memoryReportSourceLayer } from "../src/memory.js";
import type { ProfileId } from "../src/model.js";
import { ReadScopeSchema } from "../src/scope.js";
import { ReportService } from "../src/service.js";

export const personOf = (
  personId: string,
  profileId: ProfileId,
  role: "owner" | "viewer"
): Person =>
  Schema.decodeSync(PersonSchema)({
    email: `${personId}@example.com`,
    memberships: [{ profileId, role }],
    personId,
  });

export const memberOfSecond = personOf(
  "person-second",
  secondProfileId,
  "owner"
);

export const viewerOfDemo = personOf("person-viewer", demoProfileId, "viewer");

export const stranger: Person = Schema.decodeSync(PersonSchema)({
  email: "stranger@example.com",
  memberships: [],
  personId: "person-stranger",
});

export const demoScope = Schema.decodeSync(ReadScopeSchema)({
  access: "read",
  profileId: demoProfileId,
});

export const demoServiceLayer = ReportService.layer.pipe(
  Layer.provide(memoryReportSourceLayer(demoReportSeed))
);

export const demoCapabilityLayer = Layer.mergeAll(
  demoServiceLayer,
  Layer.succeed(CurrentPerson, demoPerson)
);

export const personLayer = (person: Person) =>
  Layer.mergeAll(demoServiceLayer, Layer.succeed(CurrentPerson, person));
