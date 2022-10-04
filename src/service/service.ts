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
import * as options from "../options/mod.ts";
import { createOptionsBuilder, type ServiceOptions } from "./options.ts";

interface Service<TOptions extends ServiceOptions> {
  internalApp: Application;
  router: Router;
  options: options.Options<TOptions>;

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

  loadOptions: (loaderFn: options.LoaderFn<TOptions>) => void;

  start: () => Promise<void>;
}

// public functions
const start = async <TOptions extends ServiceOptions>(
  service: Service<TOptions>,
): Promise<void> => {
  // boot application server
  await service.internalApp.listen({ port: service.options.port });
};

const init = async <TOptions extends ServiceOptions>(): Promise<
  Service<TOptions>
> => {
  // service object reference
  // deno-lint-ignore prefer-const
  let serviceObject: Service<TOptions>;

  // determine options
  const optionsBuilder = await createOptionsBuilder<TOptions>();
  const partialOptions = optionsBuilder.build();

  // initialize oak application
  const app = new oak.Application();

  app.addEventListener(
    "listen",
    (e) => {
      const protocol = (e.secure) ? "https://" : "http://";
      const hostname = (e.hostname === "0.0.0.0") ? "localhost" : e.hostname;
      const uri = `${protocol}${hostname}:${e.port}/`;

      log.info(`Application is starting on ${uri}`);
      log.debug(JSON.stringify(serviceObject.options, null, 2));
    },
  );

  // define routes
  const router = new oak.Router();

  // init logger
  await log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler(partialOptions.logs ?? "INFO"),
    },
    loggers: {
      default: {
        level: "DEBUG",
        handlers: ["console"],
      },
    },
  });

  // construct service object
  serviceObject = {
    internalApp: app,
    router: router,
    options: partialOptions,

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

    loadOptions: (loaderFn: options.LoaderFn<TOptions>): void => {
      optionsBuilder.load(loaderFn);
      serviceObject.options = optionsBuilder.build();
    },

    start: () => start<TOptions>(serviceObject),
  };

  return serviceObject;
};

const fixErrorObjectResult = (err: Error) => {
  const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));

  return JSON.parse(serialized);
};

const run = async <TOptions extends ServiceOptions>(
  initializer: (s: Service<TOptions>) => void | Promise<void>,
) => {
  try {
    const service = await init<TOptions>();

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
