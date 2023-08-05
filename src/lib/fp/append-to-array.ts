export const appendToArray = <T>(
  instance: Iterable<T>,
  ...values: T[]
): T[] => {
  return [...instance, ...values];
};

export { appendToArray as default };
