export const prependToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...values, ...instance];
};

export { prependToArray as default };
