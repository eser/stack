function mergeArrays<T>(...instances: Array<Iterable<T>>): Array<T> {
  return instances.reduce(
    (obj: Array<T>, instance: Iterable<T>) => [...obj, ...instance],
    [],
  );
}

export { mergeArrays, mergeArrays as default };
