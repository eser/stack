type Callback = () => unknown;
type Pattern = [unknown, Callback];

const match = (value: unknown, patterns: Pattern[], otherwise?: Callback) => {
  const pattern = patterns.find((x) => value === x[0]);

  if (pattern === undefined) {
    return otherwise?.();
  }

  return pattern[1]?.();
};

export { match, match as default };
