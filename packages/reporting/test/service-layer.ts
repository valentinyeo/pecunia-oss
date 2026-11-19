import type { Person } from "@pecunia/access";
import { CurrentPerson } from "@pecunia/access";
import { Layer, Schema } from "effect";

import { demoPerson, demoProfileId, demoReportSeed } from "../src/demo.js";
import { memoryReportSourceLayer } from "../src/memory.js";
import { ReadScopeSchema } from "../src/scope.js";
import { ReportService } from "../src/service.js";

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

export const strangerLayer = (person: Person) => personLayer(person);
