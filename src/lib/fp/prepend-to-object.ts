const prependToObject = <T>(
  instance: Record<string | number | symbol, T>,
  ...values: Record<string | number | symbol, T>[]
): Record<string | number | symbol, T> => {
  return Object.assign({}, ...values, instance);
};

export { prependToObject, prependToObject as default };
