import { type Context, run } from "@hex/service/mod.ts";
import { MongoDbConnection } from "@hex/data/adapters/mongodb.ts";

import { addHeaderMiddleware } from "@hex/service/middlewares/add-header.ts";
import { corsMiddleware } from "@hex/service/middlewares/cors.ts";
import { jwtMiddleware } from "@hex/service/middlewares/jwt.ts";

import { homeAction } from "@app/actions/home.ts";
import { mongoAction } from "@app/actions/mongo.ts";
import { echoAction } from "@app/actions/echo.ts";
import { errorProneAction } from "@app/actions/error-prone.ts";

import * as Sentry from "npm:@sentry/node";

import { type AppOptions } from "./types.ts";

// public functions
const app = run<AppOptions>(async (s) => {
  // configure options
  await s.configureOptions((env, options) => {
    options.mongoDbConnString = env.readString("MONGODB_CONNSTRING");
    options.sentryDsn = env.readString("SENTRY_DSN");
  });

  // configure di registry
  await s.configureDI((registry) => {
    registry.setValue("test", "placeholder value");

    registry.setValueLazy("db", async () => {
      const client = new MongoDbConnection(s.options.mongoDbConnString!);
      await client.connect();

      return client;
    });
  });

  // add middlewares
  s.addMiddleware(
    addHeaderMiddleware({ "if-none-match": "no-match-for-this" }),
  );
  s.addMiddleware(corsMiddleware());
  s.addMiddleware(jwtMiddleware());

  // add routes
  s.addHealthCheck("/health-check");

  s.addRoute("get", "/", homeAction);
  s.addRoute("get", "/mongo", mongoAction);
  s.addRoute("get", "/error", errorProneAction);

  s.addRoute("get", "/:slug", (ctx: Context) => {
    ctx.assert(ctx?.params?.slug?.length > 2, 400, "Slug is required");

    return echoAction(s.registry, ctx?.params?.slug);
  });

  // sentry initialization
  if (s.options.sentryDsn !== undefined) {
    Sentry.init({
      dsn: s.options.sentryDsn,

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: 1.0,
      environment: s.options.envName,
    });
  }
});

export { app, app as default };
