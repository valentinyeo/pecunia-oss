import type {
  AbuseScore,
  IntakeEvents,
  IntakeTicket,
} from "@pecunia/core/intake";
import type { InterestTokens, SubscriberIntake } from "@pecunia/core/interest";
import { joinIntakeLayer } from "@pecunia/core/join-interest";
import type {
  IntakeApplications,
  JoinContactStore,
} from "@pecunia/core/join-interest";
import { webCryptoLayer } from "@pecunia/core/web-crypto";
import type { Context, Effect } from "effect";
import { Layer } from "effect";

import { joinContactStoreLayer } from "./join-contact-store.js";
import type { JoinContactStub } from "./join-contact-store.js";

export interface AgentSignupOptions {
  readonly intake: Layer.Layer<IntakeTicket | AbuseScore | IntakeEvents>;
  readonly contacts: (submissionId: string) => JoinContactStub;
  readonly noteApplication?: (submissionId: string) => Effect.Effect<void>;
  readonly markPending?: (
    submissionId: string,
    pending: boolean
  ) => Effect.Effect<void>;
  readonly sweep?: {
    readonly ids: () => Effect.Effect<readonly string[]>;
    readonly schedule: (run: Effect.Effect<void>) => Effect.Effect<void>;
  };
  readonly applications?: Layer.Layer<
    IntakeApplications,
    never,
    JoinContactStore
  >;
}

export const agentSignupLayer = (
  options: AgentSignupOptions,
  services: Context.Context<InterestTokens | SubscriberIntake>
) =>
  joinIntakeLayer.pipe(
    Layer.provideMerge(
      joinContactStoreLayer(
        options.contacts,
        options.noteApplication,
        options.markPending
      ).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            options.intake,
            Layer.succeedContext(services),
            webCryptoLayer
          )
        )
      )
    )
  );
