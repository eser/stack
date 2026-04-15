// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** AI adapter barrel — tool definitions, trigger routing, and agent loop. */

export * from "./tool-definitions.ts";
export {
  createToolCallTrigger,
  mapToToolResponse,
  routeToolCall,
} from "./triggers.ts";
export type {
  ToolCallEvent,
  ToolCallResponse,
  ToolCallTrigger,
} from "./triggers.ts";
export { runPostsAgent } from "./agent.ts";
export type { RunPostsAgentOptions } from "./agent.ts";
