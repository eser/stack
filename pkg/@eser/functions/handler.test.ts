// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import * as results from "@eser/primitives/results";
import { runTask, succeed, task } from "./task.ts";
import {
  type Adapter,
  type AdaptError,
  adaptError,
  bind,
  createTrigger,
  type Handler,
  type ResponseMapper,
} from "./handler.ts";
import type {
  CliEvent,
  HttpEvent,
  HttpResponse,
  QueueEvent,
} from "./triggers.ts";

// --- Test fixtures ---

type OrderInput = {
  readonly customerId: string;
  readonly items: readonly string[];
};

type Order = {
  readonly id: string;
  readonly customerId: string;
  readonly items: readonly string[];
};

type OrderError = { readonly _tag: "OrderError"; readonly message: string };

type AppCtx = {
  readonly db: {
    insert: (input: OrderInput) => Order;
  };
};

const createOrder: Handler<OrderInput, Order, OrderError, AppCtx> = (input) =>
  task((ctx) => {
    const order = ctx.db.insert(input);
    return Promise.resolve(results.ok(order));
  });

const mockCtx: AppCtx = {
  db: {
    insert: (input) => ({
      id: "order-1",
      customerId: input.customerId,
      items: input.items,
    }),
  },
};

// --- Adapter Binding ---

describe("handler", () => {
  describe("bind", () => {
    it("binds an HTTP adapter to a handler", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(adaptError("Method not allowed"));
        }
        return results.ok(event.body as OrderInput);
      };

      const httpHandler = bind(createOrder, fromHttp);

      const event: HttpEvent = {
        method: "POST",
        path: "/orders",
        headers: {},
        query: {},
        body: { customerId: "cust-1", items: ["item-a"] },
      };

      const result = await runTask(httpHandler(event), mockCtx);
      assert(results.isOk(result));
      assertEquals(result.value.customerId, "cust-1");
      assertEquals(result.value.items, ["item-a"]);
    });

    it("returns AdaptError when adapter rejects the event", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(adaptError("Method not allowed"));
        }
        return results.ok(event.body as OrderInput);
      };

      const httpHandler = bind(createOrder, fromHttp);

      const event: HttpEvent = {
        method: "GET",
        path: "/orders",
        headers: {},
        query: {},
        body: null,
      };

      const result = await runTask(httpHandler(event), mockCtx);
      assert(results.isFail(result));
      assertEquals((result.error as AdaptError)._tag, "AdaptError");
      assertEquals(
        (result.error as AdaptError).message,
        "Method not allowed",
      );
    });

    it("binds a queue adapter to the same handler", async () => {
      const fromQueue: Adapter<QueueEvent, OrderInput> = (event) =>
        results.ok(JSON.parse(event.body as string) as OrderInput);

      const queueHandler = bind(createOrder, fromQueue);

      const event: QueueEvent = {
        messageId: "msg-1",
        body: JSON.stringify({
          customerId: "cust-2",
          items: ["item-b"],
        }),
        attributes: {},
        receiveCount: 1,
      };

      const result = await runTask(queueHandler(event), mockCtx);
      assert(results.isOk(result));
      assertEquals(result.value.customerId, "cust-2");
    });

    it("binds a CLI adapter to the same handler", async () => {
      const fromCli: Adapter<CliEvent, OrderInput> = (event) =>
        results.ok({
          customerId: event.flags["customer"] as string,
          items: event.args,
        });

      const cliHandler = bind(createOrder, fromCli);

      const event: CliEvent = {
        command: "create-order",
        args: ["item-c", "item-d"],
        flags: { customer: "cust-3" },
      };

      const result = await runTask(cliHandler(event), mockCtx);
      assert(results.isOk(result));
      assertEquals(result.value.customerId, "cust-3");
      assertEquals(result.value.items, ["item-c", "item-d"]);
    });

    it("works with context-free handlers", async () => {
      const echo: Handler<string, string, never> = (input) =>
        succeed(`Echo: ${input}`);

      const fromCli: Adapter<CliEvent, string> = (event) =>
        results.ok(event.args.join(" "));

      const cliEcho = bind(echo, fromCli);

      const event: CliEvent = {
        command: "echo",
        args: ["hello", "world"],
        flags: {},
      };

      const result = await runTask(cliEcho(event));
      assert(results.isOk(result));
      assertEquals(result.value, "Echo: hello world");
    });
  });

  // --- adaptError ---

  describe("adaptError", () => {
    it("creates an AdaptError with message", () => {
      const err = adaptError("Missing field");
      assertEquals(err._tag, "AdaptError");
      assertEquals(err.message, "Missing field");
      assertEquals(err.source, undefined);
    });

    it("creates an AdaptError with source", () => {
      const original = new Error("parse failed");
      const err = adaptError("Invalid JSON", original);
      assertEquals(err._tag, "AdaptError");
      assertEquals(err.source, original);
    });
  });

  // --- createTrigger ---

  describe("createTrigger", () => {
    it("creates a full round-trip trigger (input + output)", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) =>
        results.ok(event.body as OrderInput);

      const toHttpResponse: ResponseMapper<
        Order,
        OrderError | AdaptError,
        HttpResponse
      > = (result) => {
        if (results.isOk(result)) {
          return {
            status: 201,
            headers: { "content-type": "application/json" },
            body: result.value,
          };
        }
        return {
          status: 400,
          headers: { "content-type": "application/json" },
          body: { error: result.error },
        };
      };

      const handleHttp = createTrigger({
        handler: createOrder,
        adaptInput: fromHttp,
        adaptOutput: toHttpResponse,
      });

      const event: HttpEvent = {
        method: "POST",
        path: "/orders",
        headers: {},
        query: {},
        body: { customerId: "cust-1", items: ["item-a"] },
      };

      const response = await handleHttp(event, mockCtx);
      assertEquals(response.status, 201);
      assertEquals(
        (response.body as Order).customerId,
        "cust-1",
      );
    });

    it("maps adapter errors to response", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(adaptError("Method not allowed"));
        }
        return results.ok(event.body as OrderInput);
      };

      const toHttpResponse: ResponseMapper<
        Order,
        OrderError | AdaptError,
        HttpResponse
      > = (result) => {
        if (results.isOk(result)) {
          return { status: 201, headers: {}, body: result.value };
        }
        const error = result.error;
        if ("_tag" in error && error._tag === "AdaptError") {
          return { status: 400, headers: {}, body: { error: error.message } };
        }
        return { status: 500, headers: {}, body: { error: "Internal error" } };
      };

      const handleHttp = createTrigger({
        handler: createOrder,
        adaptInput: fromHttp,
        adaptOutput: toHttpResponse,
      });

      const event: HttpEvent = {
        method: "GET",
        path: "/orders",
        headers: {},
        query: {},
        body: null,
      };

      const response = await handleHttp(event, mockCtx);
      assertEquals(response.status, 400);
      assertEquals(
        (response.body as { error: string }).error,
        "Method not allowed",
      );
    });

    it("works with context-free handler", async () => {
      const echo: Handler<string, string, never> = (input) =>
        succeed(`Echo: ${input}`);

      const fromCli: Adapter<CliEvent, string> = (event) =>
        results.ok(event.args.join(" "));

      const toText: ResponseMapper<string, never | AdaptError, string> = (
        result,
      ) => results.isOk(result) ? result.value : `Error: ${result.error}`;

      const handleCli = createTrigger({
        handler: echo,
        adaptInput: fromCli,
        adaptOutput: toText,
      });

      const event: CliEvent = {
        command: "echo",
        args: ["hello"],
        flags: {},
      };

      const response = await handleCli(event);
      assertEquals(response, "Echo: hello");
    });
  });
});
