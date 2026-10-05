// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as bdd from "@std/testing/bdd";
import * as results from "@eserstack/primitives/results";
import * as task from "./task.ts";
import * as handler from "./handler.ts";
import type {
  Adapter,
  AdaptError,
  Handler,
  ResponseMapper,
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
  task.task((ctx) => {
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

bdd.describe("handler", () => {
  bdd.describe("bind", () => {
    bdd.it("binds an HTTP adapter to a handler", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(handler.adaptError("Method not allowed"));
        }
        return results.ok(event.body as OrderInput);
      };

      const httpHandler = handler.bind(createOrder, fromHttp);

      const event: HttpEvent = {
        method: "POST",
        path: "/orders",
        headers: {},
        query: {},
        body: { customerId: "cust-1", items: ["item-a"] },
      };

      const result = await task.runTask(httpHandler(event), mockCtx);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value.customerId, "cust-1");
      assert.assertEquals(result.value.items, ["item-a"]);
    });

    bdd.it("returns AdaptError when adapter rejects the event", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(handler.adaptError("Method not allowed"));
        }
        return results.ok(event.body as OrderInput);
      };

      const httpHandler = handler.bind(createOrder, fromHttp);

      const event: HttpEvent = {
        method: "GET",
        path: "/orders",
        headers: {},
        query: {},
        body: null,
      };

      const result = await task.runTask(httpHandler(event), mockCtx);
      assert.assert(results.isFail(result));
      assert.assertEquals((result.error as AdaptError)._tag, "AdaptError");
      assert.assertEquals(
        (result.error as AdaptError).message,
        "Method not allowed",
      );
    });

    bdd.it("binds a queue adapter to the same handler", async () => {
      const fromQueue: Adapter<QueueEvent, OrderInput> = (event) =>
        results.ok(JSON.parse(event.body as string) as OrderInput);

      const queueHandler = handler.bind(createOrder, fromQueue);

      const event: QueueEvent = {
        messageId: "msg-1",
        body: JSON.stringify({
          customerId: "cust-2",
          items: ["item-b"],
        }),
        attributes: {},
        receiveCount: 1,
      };

      const result = await task.runTask(queueHandler(event), mockCtx);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value.customerId, "cust-2");
    });

    bdd.it("binds a CLI adapter to the same handler", async () => {
      const fromCli: Adapter<CliEvent, OrderInput> = (event) =>
        results.ok({
          customerId: event.flags["customer"] as string,
          items: event.args,
        });

      const cliHandler = handler.bind(createOrder, fromCli);

      const event: CliEvent = {
        command: "create-order",
        args: ["item-c", "item-d"],
        flags: { customer: "cust-3" },
      };

      const result = await task.runTask(cliHandler(event), mockCtx);
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value.customerId, "cust-3");
      assert.assertEquals(result.value.items, ["item-c", "item-d"]);
    });

    bdd.it("works with context-free handlers", async () => {
      const echo: Handler<string, string, never> = (input) =>
        task.succeed(`Echo: ${input}`);

      const fromCli: Adapter<CliEvent, string> = (event) =>
        results.ok(event.args.join(" "));

      const cliEcho = handler.bind(echo, fromCli);

      const event: CliEvent = {
        command: "echo",
        args: ["hello", "world"],
        flags: {},
      };

      const result = await task.runTask(cliEcho(event));
      assert.assert(results.isOk(result));
      assert.assertEquals(result.value, "Echo: hello world");
    });
  });

  // --- adaptError ---

  bdd.describe("adaptError", () => {
    bdd.it("creates an AdaptError with message", () => {
      const err = handler.adaptError("Missing field");
      assert.assertEquals(err._tag, "AdaptError");
      assert.assertEquals(err.message, "Missing field");
      assert.assertEquals(err.source, undefined);
    });

    bdd.it("creates an AdaptError with source", () => {
      const original = new Error("parse failed");
      const err = handler.adaptError("Invalid JSON", original);
      assert.assertEquals(err._tag, "AdaptError");
      assert.assertEquals(err.source, original);
    });
  });

  // --- createTrigger ---

  bdd.describe("createTrigger", () => {
    bdd.it("creates a full round-trip trigger (input + output)", async () => {
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

      const handleHttp = handler.createTrigger({
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
      assert.assertEquals(response.status, 201);
      assert.assertEquals(
        (response.body as Order).customerId,
        "cust-1",
      );
    });

    bdd.it("maps adapter errors to response", async () => {
      const fromHttp: Adapter<HttpEvent, OrderInput> = (event) => {
        if (event.method !== "POST") {
          return results.fail(handler.adaptError("Method not allowed"));
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

      const handleHttp = handler.createTrigger({
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
      assert.assertEquals(response.status, 400);
      assert.assertEquals(
        (response.body as { error: string }).error,
        "Method not allowed",
      );
    });

    bdd.it("works with context-free handler", async () => {
      const echo: Handler<string, string, never> = (input) =>
        task.succeed(`Echo: ${input}`);

      const fromCli: Adapter<CliEvent, string> = (event) =>
        results.ok(event.args.join(" "));

      const toText: ResponseMapper<string, never | AdaptError, string> = (
        result,
      ) => results.isOk(result) ? result.value : `Error: ${result.error}`;

      const handleCli = handler.createTrigger({
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
      assert.assertEquals(response, "Echo: hello");
    });
  });
});
