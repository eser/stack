export const appendToArray = <T>(
  instance: Iterable<T>,
  ...values: ReadonlyArray<T>
): Array<T> => {
  return [...instance, ...values];
};

export { appendToArray as default };
