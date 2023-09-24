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
  const di = (
    strings?: TemplateStringsArray,
    ...others: ReadonlyArray<string>
  ) => {
    if (strings === undefined) {
      return services;
    }

    if (strings.length === 1) {
      return services.get(strings[0] as K);
    }

    let result = strings[0];

    for (let i = 0; i < strings.length - 1; i++) {
      result += `${services.get(others[i] as K)}${strings[i + 1]}`;
    }

    return result;
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
