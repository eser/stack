const appendToObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: Record<string | number | symbol, T>[]
): Record<string | number | symbol, T> => {
  return Object.assign({}, instance, ...values);
};

export { appendToObject, appendToObject as default };
