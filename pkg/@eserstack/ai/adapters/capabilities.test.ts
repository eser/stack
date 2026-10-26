// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import type * as ffiTypes from "@eserstack/ajan/ffi";
import * as fake from "@eserstack/ajan/ffi/fake";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as config from "../config.ts";
import type * as model from "../model.ts";
import * as ajanBridge from "./ajan-bridge.ts";
import * as anthropic from "./anthropic.ts";
import * as claudeCode from "./claude-code.ts";
import * as gemini from "./gemini.ts";
import * as kiro from "./kiro.ts";
import * as ollama from "./ollama.ts";
import * as openai from "./openai.ts";
import * as opencode from "./opencode.ts";
import * as vertexai from "./vertexai.ts";

// TASK-159: a provider declares the same capabilities whichever path serves
// it: the TypeScript adapter, the bridge model, and the Go model behind the
// bridge. The anthropic lists disagreed on reasoning, gemini and vertexai
// bridge models left out audio, structured output and reasoning, and the
// vertexai one declared batch processing that the Go model does not have.
//
// The bridge does not report the Go model's capabilities, so the Go lists are
// read from the aifx source: the constants a GetCapabilities function returns.

/** The aifx package directory, found from this file's own location. */
const aifxPath = (file: string): string => {
  const dir = import.meta.dirname;
  assert.assertExists(dir, "the test reads the Go sources next to its file");

  return runtime.path.resolve(dir, "../../../ajan/aifx", file);
};

/** The provider a target names, with its defaults applied. */
const target = (provider: string) =>
  config.withDefaults({ provider, model: "test-model" });

/** A native library whose only call creates a model under one handle. */
const stubLib: ffiTypes.FFILibrary = fake.createFakeLibrary({
  calls: { aiCreateModel: () => ({ handle: "model-1" }) },
});

const bridgeCapabilities = async (
  provider: string,
): Promise<readonly string[]> => {
  const factory = ajanBridge
    .createBridgeFactories(stubLib)
    .find((candidate) => candidate.provider === provider);
  assert.assertExists(factory, `the bridge has no ${provider} provider`);

  const bridgeModel = await factory.createModel(target(provider));

  return bridgeModel.capabilities;
};

/** Maps each Go capability constant, such as CapabilityReasoning, to its value. */
const goCapabilityValues = async (): Promise<ReadonlyMap<string, string>> => {
  const source = await runtime.fs.readTextFile(aifxPath("generation.go"));
  const values = new Map<string, string>();

  for (const match of source.matchAll(
    /\b(Capability\w+)\s+ProviderCapability\s*=\s*"(\w+)"/g,
  )) {
    values.set(match[1]!, match[2]!);
  }

  return values;
};

/** The capabilities the Go function that starts with `signature` returns. */
const goCapabilities = async (
  file: string,
  signature: string,
): Promise<readonly string[]> => {
  const source = await runtime.fs.readTextFile(aifxPath(file));
  const start = source.indexOf(signature);
  assert.assert(start !== -1, `${file} has no "${signature}"`);

  const end = source.indexOf("\n}\n", start);
  assert.assert(end !== -1, `${file}: "${signature}" has no closing brace`);

  const values = await goCapabilityValues();
  const body = source.slice(start, end);

  return [...body.matchAll(/\bCapability[A-Z]\w*\b/g)].map(([name]) => {
    const value = values.get(name);
    assert.assertExists(value, `${name} is not a capability in generation.go`);

    return value;
  });
};

const sorted = (capabilities: readonly string[]): readonly string[] =>
  [...capabilities].sort();

const apiProviders: ReadonlyArray<{
  readonly provider: string;
  readonly adapter: () => model.LanguageModel;
  readonly goFile: string;
  readonly goSignature: string;
}> = [
  {
    provider: "anthropic",
    adapter: () => new anthropic.AnthropicModel({}, target("anthropic")),
    goFile: "adapter_anthropic.go",
    goSignature: "func (m *AnthropicModel) GetCapabilities()",
  },
  {
    provider: "openai",
    adapter: () => new openai.OpenAIModel({}, target("openai")),
    goFile: "adapter_openai.go",
    goSignature: "func (m *OpenAIModel) GetCapabilities()",
  },
  {
    provider: "gemini",
    adapter: () => new gemini.GeminiModel({}, target("gemini")),
    goFile: "adapter_gemini.go",
    goSignature: "func geminiCapabilities()",
  },
  {
    provider: "vertexai",
    adapter: () => new vertexai.VertexAIModel({}, target("vertexai")),
    goFile: "adapter_vertexai.go",
    goSignature: "func vertexAICapabilities()",
  },
  {
    provider: "ollama",
    adapter: () =>
      new ollama.OllamaModel("http://127.0.0.1:9", target("ollama")),
    goFile: "adapter_ollama.go",
    goSignature: "func (m *OllamaModel) GetCapabilities()",
  },
];

for (const tc of apiProviders) {
  nodeTest.test(
    `${tc.provider}: the adapter, the bridge and Go declare the same capabilities`,
    async () => {
      const adapter = sorted(tc.adapter().capabilities);

      assert.assertEquals(
        sorted(await bridgeCapabilities(tc.provider)),
        adapter,
        "bridge and TypeScript adapter differ",
      );
      assert.assertEquals(
        sorted(await goCapabilities(tc.goFile, tc.goSignature)),
        adapter,
        `Go (${tc.goFile}) and TypeScript adapter differ`,
      );
    },
  );
}

nodeTest.test("anthropic declares reasoning on every path", async () => {
  const goList = await goCapabilities(
    "adapter_anthropic.go",
    "func (m *AnthropicModel) GetCapabilities()",
  );
  const adapter = new anthropic.AnthropicModel({}, target("anthropic"));

  assert.assert(adapter.capabilities.includes("reasoning"), "TypeScript");
  assert.assert(
    (await bridgeCapabilities("anthropic")).includes("reasoning"),
    "bridge",
  );
  assert.assert(goList.includes("reasoning"), "Go");
});

// The Go ACP model picks its list per backend at run time, which the source
// does not show as one list; TestACPCapabilitiesPerBackend in aifx pins it to
// the lists below.
const agentProviders: ReadonlyArray<{
  readonly provider: string;
  readonly adapter: () => model.LanguageModel;
}> = [
  {
    provider: "claude-code",
    adapter: () =>
      new claudeCode.ClaudeCodeModel("claude", target("claude-code")),
  },
  {
    provider: "kiro",
    adapter: () => new kiro.KiroModel("kiro", target("kiro")),
  },
  {
    provider: "opencode",
    adapter: () => new opencode.OpenCodeModel("opencode", target("opencode")),
  },
];

for (const tc of agentProviders) {
  nodeTest.test(
    `${tc.provider}: the adapter and the bridge declare the same capabilities`,
    async () => {
      assert.assertEquals(
        sorted(await bridgeCapabilities(tc.provider)),
        sorted(tc.adapter().capabilities),
      );
    },
  );
}
