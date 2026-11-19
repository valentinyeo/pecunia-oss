import { PersonSchema, ProfileIdSchema } from "@pecunia/access";
import type { Person, ProfileId, Role } from "@pecunia/access";
import { Schema } from "effect";

import { ReportIdSchema, ReportSchema } from "../src/index.js";
import type { Report, ReportDraft, ReportId } from "../src/index.js";

export const DEMO_PROFILE = "profile-demo";

export const OTHER_PROFILE = "profile-other";

export const profileId = (value: string): ProfileId =>
  Schema.decodeSync(ProfileIdSchema)(value);

export const personWith = (
  email: string,
  memberships: readonly {
    readonly profileId: string;
    readonly role: Role;
  }[]
): Person =>
  Schema.decodeSync(PersonSchema)({
    email,
    memberships,
    personId: `person-${email}`,
  });

export const ownerOf = (email: string, profile: string): Person =>
  personWith(email, [{ profileId: profile, role: "owner" }]);

export const reportId = (value: string): ReportId =>
  Schema.decodeSync(ReportIdSchema)(value);

export const draft = (
  id: string,
  title: string,
  body: string
): ReportDraft => ({ body, id, title });

export interface StoredReportInput {
  readonly body: string;
  readonly createdAt: number;
  readonly id: string;
  readonly profile: string;
  readonly title: string;
  readonly updatedAt: number;
}

export const storedReport = (input: StoredReportInput): Report =>
  Schema.decodeSync(ReportSchema)({
    body: input.body,
    createdAt: input.createdAt,
    id: input.id,
    ownerProfileId: input.profile,
    title: input.title,
    updatedAt: input.updatedAt,
  });
