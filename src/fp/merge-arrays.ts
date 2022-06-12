function mergeArrays<T>(...instances: Iterable<T>[]): T[] {
  return instances.reduce(
    (obj: T[], instance: Iterable<T>) => [...obj, ...instance],
    [],
  );
}

export { mergeArrays, mergeArrays as default };
