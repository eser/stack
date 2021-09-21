type DependencyList = ReadonlyArray<unknown>;

function useMemo<T>(factory: () => T, deps: DependencyList | undefined): T {
  return factory();
}

export { useMemo as default };
