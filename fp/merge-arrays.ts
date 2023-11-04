export const mergeArrays = <T>(
  ...instances: ReadonlyArray<Iterable<T>>
): Array<T> => {
  return instances.reduce(
    (obj: ReadonlyArray<T>, instance: Iterable<T>) => [...obj, ...instance],
    [],
  );
};

export { mergeArrays as default };
