import type { AccessNeed } from "@pecunia/access";
import type {
  AnyContract,
  InputSchema,
  PlainSchema,
} from "@pecunia/capability/contract";
import { Effect, Schema } from "effect";

import { refusalFromSchema, refusalOfFailure } from "./refusal.js";
import type { ToolFailureSchema, ToolRefused } from "./refusal.js";

export interface ToolContract extends AnyContract {
  readonly failure: typeof ToolFailureSchema;
  readonly needsApproval: false;
}

export interface ToolCapability<C extends ToolContract, R> {
  readonly contract: C;
  readonly handler: (
    input: C["input"]["Type"]
  ) => Effect.Effect<C["output"]["Type"], C["failure"]["Type"], R>;
}

export interface ToolResult {
  readonly output: unknown;
  readonly outputSize: number;
}

export interface ToolDefinition<R = never> {
  readonly access: AccessNeed;
  readonly call: (
    input: Schema.Json
  ) => Effect.Effect<ToolResult, ToolRefused, R>;
  readonly description: string;
  readonly input: InputSchema;
  readonly name: string;
  readonly output: PlainSchema;
}

export const toolOf = <C extends ToolContract, R>(
  capability: ToolCapability<C, R>
): ToolDefinition<R> => {
  const { contract } = capability;

  const decodeInput = Schema.decodeUnknownEffect(contract.input, {
    onExcessProperty: "error",
  });

  const decodeOutput = Schema.decodeUnknownEffect(contract.output);

  const encodeOutput = Schema.encodeEffect(contract.output);

  const call = (input: Schema.Json) =>
    Effect.gen(function* callTool() {
      const parsed = yield* decodeInput(input).pipe(
        Effect.mapError((failure) =>
          refusalFromSchema(failure, contract.name, "input")
        )
      );

      const output = yield* capability
        .handler(parsed)
        .pipe(Effect.mapError(refusalOfFailure));

      const encoded = yield* encodeOutput(output).pipe(
        Effect.mapError((failure) =>
          refusalFromSchema(failure, contract.name, "output")
        )
      );

      yield* decodeOutput(encoded).pipe(
        Effect.mapError((failure) =>
          refusalFromSchema(failure, contract.name, "output")
        )
      );

      return { output: encoded, outputSize: JSON.stringify(encoded).length };
    });

  return {
    access: contract.annotations.readOnly ? "read" : "write",
    call,
    description: contract.description,
    input: contract.input,
    name: contract.name,
    output: contract.output,
  };
};
