// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Trigger adapters for multi-source function invocation.
 *
 * Implements the Ports & Adapters (hexagonal architecture) pattern for
 * function invocation. Define business logic once as a `Handler`, then
 * bind it to multiple trigger sources (HTTP, queue, CLI, cron) via `Adapter`.
 *
 * ### Define a Handler
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * type OrderInput = { readonly customerId: string };
 * type Order = { readonly id: string; readonly customerId: string };
 * type AppCtx = { readonly orders: Order[] };
 *
 * const createOrder: functions.handler.Handler<
 *   OrderInput,
 *   Order,
 *   Error,
 *   AppCtx
 * > = (input) =>
 *   functions.task.task((ctx) => {
 *     const order = { id: `order-${ctx.orders.length + 1}`, ...input };
 *     ctx.orders.push(order);
 *     return Promise.resolve(primitives.results.ok(order));
 *   });
 * ```
 *
 * ### Bind to Triggers
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * type OrderInput = { readonly customerId: string };
 * type HttpEvent = functions.triggers.HttpEvent;
 *
 * const createOrder = (input: OrderInput) =>
 *   functions.task.succeed({ id: "order-1", ...input });
 * const fromHttp: functions.handler.Adapter<HttpEvent, OrderInput> = (event) =>
 *   event.method === "POST"
 *     ? primitives.results.ok(event.body as OrderInput)
 *     : primitives.results.fail(
 *       functions.handler.adaptError("Method not allowed"),
 *     );
 *
 * const httpHandler = functions.handler.bind(createOrder, fromHttp);
 * const httpEvent: HttpEvent = {
 *   method: "POST",
 *   path: "/orders",
 *   headers: {},
 *   query: {},
 *   body: { customerId: "cust-1" },
 * };
 * const result = await functions.task.runTask(httpHandler(httpEvent));
 * ```
 *
 * ### FP Pattern: Contravariant Functor on Input
 *
 * `bind()` is a contravariant map — it maps over the Handler's input type
 * in reverse. The adapter can fail, so the error type naturally widens:
 * `E | AdaptError`.
 *
 * @see {@link "./triggers.ts"} for standard trigger event types
 * @see {@link "./task.ts"} for Task and context management
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as task from "./task.ts";
import type { Task } from "./task.ts";

// --- Core Types ---

/**
 * A Handler is a function from typed Input to a context-aware Task.
 * This is the core business logic — agnostic of how it's triggered.
 *
 * Analogous to AWS Lambda's handler function, but with typed context.
 *
 * @template I - Input type
 * @template O - Output (success) type
 * @template E - Error type
 * @template R - Requirements/context type
 */
export type Handler<I, O, E = Error, R = void> = (input: I) => Task<O, E, R>;

/**
 * An Adapter transforms a trigger-specific event into the handler's
 * expected input type. Returns Result to handle malformed events.
 *
 * This is the "port" in hexagonal architecture — it translates
 * external protocols into internal domain types.
 *
 * @template TriggerEvent - The trigger-specific event type
 * @template I - The handler's expected input type
 */
export type Adapter<TriggerEvent, I> = (
  event: TriggerEvent,
) => results.Result<I, AdaptError>;

/**
 * AdaptError represents a failure to transform a trigger event
 * into the handler's expected input (e.g., missing fields, invalid format).
 */
export type AdaptError = {
  readonly _tag: "AdaptError";
  readonly message: string;
  readonly source?: unknown;
};

/**
 * Maps a function's Result to a trigger-specific response format.
 *
 * @template O - Output (success) type
 * @template E - Error type
 * @template TriggerResponse - The trigger-specific response type
 */
export type ResponseMapper<O, E, TriggerResponse> = (
  result: results.Result<O, E>,
) => TriggerResponse;

/**
 * A complete trigger binding — adapts both input and output for a
 * specific invocation source. This is the full "port" definition.
 *
 * @template TriggerEvent - The trigger-specific event type
 * @template TriggerResponse - The trigger-specific response type
 * @template I - Handler input type
 * @template O - Handler output type
 * @template E - Handler error type
 * @template R - Handler context requirements
 */
export type TriggerBinding<TriggerEvent, TriggerResponse, I, O, E, R> = {
  readonly handler: Handler<I, O, E, R>;
  readonly adaptInput: Adapter<TriggerEvent, I>;
  readonly adaptOutput: ResponseMapper<O, E | AdaptError, TriggerResponse>;
};

// --- Constructors ---

/**
 * Create an AdaptError with the given message.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * type OrderInput = { readonly customerId: string };
 * type HttpEvent = functions.triggers.HttpEvent;
 *
 * const fromHttp: functions.handler.Adapter<HttpEvent, OrderInput> = (event) =>
 *   event.method !== "POST"
 *     ? primitives.results.fail(
 *       functions.handler.adaptError("Method not allowed"),
 *     )
 *     : primitives.results.ok(event.body as OrderInput);
 * ```
 */
export const adaptError = (message: string, source?: unknown): AdaptError => ({
  _tag: "AdaptError",
  message,
  source,
});

// --- Composition ---

/**
 * Bind an adapter to a handler — creates a new handler that accepts
 * the trigger event type directly.
 *
 * Error type widens: `E | AdaptError` (adapter can fail).
 * Context R passes through unchanged.
 *
 * This is a **contravariant map** on the input side — it maps over the
 * Handler's input type in reverse.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * const greet = (name: string) => functions.task.succeed(`Hello, ${name}`);
 * const fromCli = (event: functions.triggers.CliEvent) =>
 *   primitives.results.ok(event.args[0] ?? "world");
 *
 * const cliHandler = functions.handler.bind(greet, fromCli);
 * const result = await functions.task.runTask(
 *   cliHandler({ command: "greet", args: ["Ada"], flags: {} }),
 * );
 * ```
 *
 * @param handler - The core business logic handler
 * @param adapter - Transforms trigger events into handler input
 * @returns A new handler accepting the trigger event type
 */
export const bind =
  <TriggerEvent, I, O, E, R = void>(
    handler: Handler<I, O, E, R>,
    adapter: Adapter<TriggerEvent, I>,
  ): Handler<TriggerEvent, O, E | AdaptError, R> =>
  (event: TriggerEvent) => {
    const adapted = adapter(event);

    if (results.isFail(adapted)) {
      return task.failTask(adapted.error) as Task<O, E | AdaptError, R>;
    }

    return handler(adapted.value) as Task<O, E | AdaptError, R>;
  };

/**
 * Create a runnable function from a complete trigger binding.
 * Returns an async function that accepts the trigger event and context,
 * producing a trigger-specific response.
 *
 * ```ts
 * import * as functions from "@eserstack/functions";
 * import * as primitives from "@eserstack/primitives";
 *
 * const toHttpResponse = (
 *   result: primitives.results.Result<string, functions.handler.AdaptError>,
 * ): functions.triggers.HttpResponse =>
 *   primitives.results.isOk(result)
 *     ? { status: 200, headers: {}, body: result.value }
 *     : { status: 400, headers: {}, body: result.error.message };
 *
 * const handleHttpGreet = functions.handler.createTrigger({
 *   handler: (name: string) => functions.task.succeed(`Hello, ${name}`),
 *   adaptInput: (event: functions.triggers.HttpEvent) =>
 *     primitives.results.ok(event.query["name"] ?? "world"),
 *   adaptOutput: toHttpResponse,
 * });
 *
 * const response = await handleHttpGreet({
 *   method: "GET",
 *   path: "/greet",
 *   headers: {},
 *   query: { name: "Ada" },
 *   body: null,
 * });
 * ```
 *
 * @param binding - Complete trigger binding (input adapter + handler + output mapper)
 * @returns An async function from (event, ctx) → response
 */
export const createTrigger =
  <TriggerEvent, TriggerResponse, I, O, E, R = void>(
    binding: TriggerBinding<TriggerEvent, TriggerResponse, I, O, E, R>,
  ): ((
    event: TriggerEvent,
    ...args: R extends void ? [] : [ctx: R]
  ) => Promise<TriggerResponse>) =>
  async (event, ...args) => {
    const boundHandler = bind(binding.handler, binding.adaptInput);
    const result = await task.runTask(
      boundHandler(event),
      ...(args as R extends void ? [] : [ctx: R]),
    );
    return binding.adaptOutput(result);
  };
