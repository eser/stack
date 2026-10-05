// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** AI adapter barrel: tool definitions, trigger routing and the agent loop. */

export {
  bookmarkPostDefinition,
  composePostToAllDefinition,
  composeTweetDefinition,
  getPostDefinition,
  postThreadDefinition,
  postToolDefinitions,
  quotePostDefinition,
  removeBookmarkDefinition,
  replyDefinition,
  repostDefinition,
  searchPostsAllDefinition,
  searchPostsDefinition,
  translateAndPostDefinition,
  undoRepostDefinition,
} from "./tool-definitions.ts";
export {
  describeArgumentIssues,
  SUPPORTED_SCHEMA_KEYWORDS,
  validateToolArguments,
} from "./tool-arguments.ts";
export type {
  ToolArgumentIssue,
  ToolSchema,
  ToolSchemaType,
} from "./tool-arguments.ts";
export {
  createToolCallTrigger,
  mapToToolResponse,
  routeToolCall,
} from "./triggers.ts";
export type {
  FanOutPartialContent,
  ThreadPartialContent,
  ToolCallEvent,
  ToolCallResponse,
  ToolCallTrigger,
} from "./triggers.ts";
export { runPostsAgent } from "./agent.ts";
export type { RunPostsAgentOptions } from "./agent.ts";
