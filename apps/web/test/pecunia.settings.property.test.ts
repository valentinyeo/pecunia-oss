import { expect, it } from "@effect/vitest";
import { SettingsSaveSchema } from "@pecunia/core/contracts";
import type { Setup } from "@pecunia/core/contracts";
import { Option, Result, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { Message as SettingsMessage } from "../src/client/pecunia/settings/message.js";
import type { SettingsMessageValue } from "../src/client/pecunia/settings/message.js";
import {
  initialSettings,
  parseDraft,
  SettingsScreen,
  shownBaseCurrency,
} from "../src/client/pecunia/settings/model.js";
import type {
  SettingsDraftValue,
  SettingsScreenValue,
} from "../src/client/pecunia/settings/model.js";
import {
  open as openSettings,
  update as updateSettings,
} from "../src/client/pecunia/settings/update.js";
import {
  demoSetup,
  primaryCurrencyOf,
  savedInto,
} from "./pecunia-settings-fixture.js";

const CASES = 650;

const SEED = 24_120_412;

interface Generator {
  readonly chance: (probability: number) => boolean;
  readonly count: (max: number) => number;
  readonly pick: <Value>(values: readonly [Value, ...Value[]]) => Value;
}

const seededGenerator = (seed: number): Generator => {
  let state = seed % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  const next = () => {
    state = (state * 16_807) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };

  return {
    chance: (probability) => next() < probability,
    count: (max) => Math.floor(next() * max),
    pick: (values) => values[Math.floor(next() * values.length)] ?? values[0],
  };
};

const CURRENCIES = [
  "GBP",
  "EUR",
  "USD",
  "JPY",
  "gbp",
  "EU",
  "ZZZ",
  "",
  " GBP",
  "GBPX",
  "gb",
] as const;

const LANGUAGE_TAGS = [
  "en-GB",
  "de-DE",
  "fr-FR",
  "en-gb",
  "en-GB-x",
  "",
  "e",
  "english",
] as const;

const TIME_ZONES = [
  "Europe/London",
  "America/New_York",
  "Asia/Tokyo",
  "europe/london",
  "",
  "Mars/Olympus",
  "Europe",
] as const;

const SaveArgs = Schema.Struct({ save: SettingsSaveSchema });

const Pending = defineTaggedUnion({
  Read: {},
  Save: { save: SettingsSaveSchema },
});

type PendingValue = typeof Pending.Type;

interface Simulation {
  readonly pending: readonly PendingValue[];
  readonly screen: SettingsScreenValue;
  readonly setup: Setup;
}

const pendingOf = (
  commands: readonly Readonly<{ args?: object; name: string }>[]
): readonly PendingValue[] =>
  commands.map((command) =>
    command.name === "SaveSettings"
      ? Pending.Save({
          save: Schema.decodeUnknownSync(SaveArgs)(command.args).save,
        })
      : Pending.Read()
  );

const send = (
  simulation: Simulation,
  message: SettingsMessageValue
): Simulation => {
  const result = updateSettings(simulation.screen, "owner", message);

  return {
    pending: [...simulation.pending, ...pendingOf(result.commands ?? [])],
    screen: result.model,
    setup: simulation.setup,
  };
};

const open = (simulation: Simulation): Simulation => {
  const result = openSettings(simulation.screen);

  return {
    ...simulation,
    pending: pendingOf(result.commands ?? []),
    screen: result.model,
  };
};

const resolveOne = (simulation: Simulation, item: PendingValue): Simulation =>
  Pending.match(item, {
    Read: () =>
      send(
        simulation,
        SettingsMessage.CompletedLoad({ setup: simulation.setup })
      ),
    Save: ({ save }) => {
      const setup = savedInto(simulation.setup, save);

      return send(
        { ...simulation, setup },
        SettingsMessage.CompletedSave({ setup })
      );
    },
  });

const resolveAll = (simulation: Simulation): Simulation => {
  let current: Simulation = { ...simulation, pending: [] };

  for (const item of simulation.pending) {
    current = resolveOne(current, item);
  }

  return current;
};

const shown = (simulation: Simulation): string | undefined =>
  Option.getOrUndefined(shownBaseCurrency(simulation.screen));

const draftOf = (simulation: Simulation): SettingsDraftValue | undefined =>
  Schema.is(SettingsScreen.Editing)(simulation.screen)
    ? simulation.screen.draft
    : undefined;

const typedMessage = (generate: Generator): SettingsMessageValue => {
  const field = generate.pick(["baseCurrency", "locale", "timezone"] as const);

  if (field === "baseCurrency") {
    return SettingsMessage.TypedBaseCurrency({
      value: generate.pick(CURRENCIES),
    });
  }

  return field === "locale"
    ? SettingsMessage.TypedLocale({ value: generate.pick(LANGUAGE_TAGS) })
    : SettingsMessage.TypedTimezone({ value: generate.pick(TIME_ZONES) });
};

const expectShown = (simulation: Simulation) => {
  const saved = primaryCurrencyOf(simulation.setup);

  if (saved !== undefined) {
    expect(shown(simulation)).toBe(saved);
  }
};

it("the shown base currency is always the last saved valid value", () => {
  const generate = seededGenerator(SEED);

  for (let index = 0; index < CASES; index += 1) {
    let simulation = resolveAll(
      open({
        pending: [],
        screen: initialSettings,
        setup: demoSetup,
      })
    );

    expectShown(simulation);

    const typing = 1 + generate.count(4);

    for (let step = 0; step < typing; step += 1) {
      simulation = send(simulation, typedMessage(generate));
      expectShown(simulation);
    }

    const savedBefore = primaryCurrencyOf(simulation.setup);
    const draft = draftOf(simulation);
    const refused = draft !== undefined && Result.isFailure(parseDraft(draft));

    simulation = send(simulation, SettingsMessage.Submitted());

    if (refused) {
      expect(simulation.pending).toHaveLength(0);
      expect(primaryCurrencyOf(simulation.setup)).toBe(savedBefore);
      expectShown(simulation);
    }

    const inFlight = simulation.pending.length;

    if (generate.chance(0.5)) {
      simulation = send(simulation, SettingsMessage.Submitted());
      expect(simulation.pending).toHaveLength(inFlight);
      expectShown(simulation);
    }

    simulation = resolveAll(simulation);
    expectShown(simulation);

    const saved = simulation.setup;

    simulation = resolveAll(send(simulation, SettingsMessage.Submitted()));

    expect(simulation.setup).toStrictEqual(saved);
    expectShown(simulation);
  }
}, 30_000);
