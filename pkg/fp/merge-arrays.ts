export const mergeArrays = <T>(...instances: readonly Iterable<T>[]): T[] => {
  return instances.reduce(
    (obj: readonly T[], instance: Iterable<T>) => [...obj, ...instance],
    [],
  );
};

export { mergeArrays as default };
