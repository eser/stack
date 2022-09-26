import { log, oak } from "./deps.ts";
import {
  type Application,
  type Context,
  type HttpMethods,
  type Middleware,
  type RouteParams,
  type Router,
  type RouterContext,
  type RouterMiddleware,
  type State,
} from "./http-types.ts";
import { loadServiceOptions, ServiceOptions } from "./options.ts";

interface Service {
  internalApp: Application;
  router: Router;
  options: ServiceOptions;

  addMiddleware: (middleware: Middleware) => void;
  addHealthCheck: (path: string) => void;
  addRoute: <
    R extends string,
    P extends RouteParams<R> = RouteParams<R>,
    // deno-lint-ignore no-explicit-any
    S extends State = Record<string, any>,
  >(
    method: HttpMethods,
    path: R,
    ...middlewares: [
      ...RouterMiddleware<R, P, S>[],
      (ctx: RouterContext<R, P, S> | Context) => unknown,
    ] | [
      // FIXME sorry, it's mandatory hack for typescript
      (ctx: Context) => unknown,
    ]
  ) => void;

  start: () => Promise<void>;
}

// public functions
const start = async (service: Service): Promise<void> => {
  // boot application server
  await service.internalApp.listen({ port: service.options.port });
};

const init = async (customOptions?: ServiceOptions): Promise<Service> => {
  // determine options
  const options_ = customOptions ?? await loadServiceOptions();

  // initialize oak application
  const app = new oak.Application();

  app.addEventListener(
    "listen",
    (e) => {
      const protocol = (e.secure) ? "https://" : "http://";
      const hostname = (e.hostname === "0.0.0.0") ? "localhost" : e.hostname;
      const uri = `${protocol}${hostname}:${e.port}/`;

      log.info(`Application is starting on ${uri}`);
      log.debug(JSON.stringify(options_, null, 2));
    },
  );

  // define routes
  const router = new oak.Router();

  // init logger
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(options_.logs ?? "INFO"),
    },
    loggers: {
      default: {
        level: "DEBUG",
        handlers: ["console"],
      },
    },
  });

  // construct service object
  const serviceObject: Service = {
    internalApp: app,
    router: router,
    options: options_,

    addMiddleware: (middleware: Middleware): void => {
      app.use(middleware);
    },

    addHealthCheck: (path: string): void => {
      router.get(path, (ctx) => {
        ctx.response.body = "";
      });
    },

    addRoute: <
      R extends string,
      P extends RouteParams<R> = RouteParams<R>,
      // deno-lint-ignore no-explicit-any
      S extends State = Record<string, any>,
    >(
      method: HttpMethods,
      path: R,
      ...middlewares: [
        ...RouterMiddleware<R, P, S>[],
        (ctx: RouterContext<R, P, S> | Context) => unknown,
      ] | [
        // FIXME sorry, it's mandatory hack for typescript
        (ctx: Context) => unknown,
      ]
    ): void => {
      const fn = middlewares.slice(-1)[0] as
        | ((ctx: RouterContext<R, P, S>) => unknown)
        | undefined;

      const middlewares_ = middlewares.slice(0, -1) as RouterMiddleware<
        R,
        P,
        S
      >[];
      middlewares_.push((ctx: RouterContext<R, P, S>) => {
        const result = fn?.(ctx);

        if (result === undefined || result === null) {
          ctx.response.body = "";
        } else {
          ctx.response.body = JSON.stringify(result);
        }
      });

      // @ts-ignore you know nothing typescript
      router[method](path, ...middlewares_);
    },

    start: () => start(serviceObject),
  };

  return serviceObject;
};

const fixErrorObjectResult = (err: Error) => {
  const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));

  return JSON.parse(serialized);
};

const run = async (initializer: (s: Service) => void | Promise<void>) => {
  try {
    const service = await init();

    // deno-lint-ignore no-explicit-any
    service.internalApp.use(async (ctx: any, next: any) => {
      try {
        await next();
      } catch (err) {
        log.error(err);

        if (oak.isHttpError(err)) {
          ctx.response.status = err.status;
        } else {
          ctx.response.status = 500;
        }

        if (service.options.envName === "production") {
          ctx.response.body = { error: err.message };
        } else {
          ctx.response.body = {
            error: err.message,
            details: fixErrorObjectResult(err),
          };
        }
        ctx.response.type = "json";
      }
    });

    await initializer(service);

    // insert these as last 2 middlewares
    service.internalApp.use(service.router.routes());
    service.internalApp.use(service.router.allowedMethods());

    await service.start();
  } catch (error) {
    log.error(error);
  }
};

export { run, run as default };
