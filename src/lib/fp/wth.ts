const wth = <T>(
  instance: Record<string | number | symbol, T>,
  mapping: Record<string | number | symbol, T>,
): Record<string | number | symbol, T> => {
  return Object.assign({}, instance, mapping);
};

export { wth, wth as default };
