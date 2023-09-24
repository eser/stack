import {
  type Promisable,
  type PromisableBuilder,
  type ServiceKey,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";

export const factory = <K = ServiceKey, V = ServiceValue>(
  services: ServiceScope<K, V>,
) => {
  const di = (strings?: TemplateStringsArray) => {
    if (strings === undefined) {
      return services;
    }

    return services.get(strings[0] as K);
  };

  di.many = (...tokens: ReadonlyArray<K>) => services.getMany(...tokens);

  // deno-lint-ignore no-explicit-any
  di.invoke = <T extends (...args: any) => any>(fn: T): ReturnType<T> =>
    services.invoke(fn);

  di.scope = () => services.createScope();

  di.register = (token: K, value: Promisable<V>) =>
    services.registry.set(token, value);

  di.registerLazy = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setLazy(token, value);

  di.registerScoped = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setScoped(token, value);

  di.registerTransient = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setTransient(token, value);

  return di;
};
