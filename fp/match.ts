export type Callback = () => unknown;
export type Pattern = [unknown, Callback];

export const match = (
  value: unknown,
  patterns: ReadonlyArray<Pattern>,
  otherwise?: Callback,
) => {
  const pattern = patterns.find((x) => value === x[0]);

  if (pattern === undefined) {
    return otherwise?.();
  }

  return pattern[1]?.();
};

export { match as default };
