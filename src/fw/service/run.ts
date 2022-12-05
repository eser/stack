import { log, oak } from "./deps.ts";
import {
  type Context,
  type HttpMethods,
  type Middleware,
  type RouteParams,
  type RouterContext,
  type RouterMiddleware,
  type Service,
  type ServiceOptions,
  type State,
} from "./types.ts";
import * as options from "../../lib/options/mod.ts";
import * as di from "../../lib/di/mod.ts";
import { createOptionsBuilder } from "./options.ts";
import { errorHandlerMiddleware } from "./middlewares/error-handler.ts";

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

  // define routes
  const router = new oak.Router();

  const appState = {
    router: router,
    registry: di.registry,
    options: partialOptions,
  };

  // initialize oak application
  const app = new oak.Application({ state: appState });

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
    ...appState,

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
      middlewares_.push(async (ctx: RouterContext<R, P, S>) => {
        const result = await fn?.(ctx);

        if (result === undefined || result === null) {
          ctx.response.body = "";
        } else {
          ctx.response.body = JSON.stringify(result);
        }
      });

      // @ts-ignore you know nothing typescript
      router[method](path, ...middlewares_);
    },

    configureOptions: async (
      configureOptionsFn: options.ConfigureOptionsFn<TOptions>,
    ): Promise<void> => {
      await optionsBuilder.load(configureOptionsFn);
      serviceObject.options = optionsBuilder.build();
    },

    configureDI: async (
      configureDIFn: (registry: di.Registry) => Promise<void> | void,
    ) => {
      await configureDIFn(di.registry);
    },

    start: () => start<TOptions>(serviceObject),
  };

  return serviceObject;
};

const run = async <TOptions extends ServiceOptions>(
  ...initializers: ((s: Service<TOptions>) => void | Promise<void>)[]
) => {
  try {
    const service = await init<TOptions>();

    service.internalApp.use(errorHandlerMiddleware(service));

    for (const initializer of initializers) {
      await initializer(service);
    }

    // insert these as last 2 middlewares
    service.internalApp.use(service.router.routes());
    service.internalApp.use(service.router.allowedMethods());

    await service.start();
  } catch (error) {
    log.error(error);
  }
};

export { run, run as default };
