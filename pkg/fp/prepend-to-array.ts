export const prependToArray = <T>(
  instance: Iterable<T>,
  ...values: T[]
): T[] => {
  return [...values, ...instance];
};

export { prependToArray as default };
