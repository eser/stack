const curry = <T1, T2, T3>(
  func: (...args: readonly [...readonly T1[], ...Array<T2>]) => T3,
  ...args: readonly T1[]
): (...args: readonly T2[]) => T3 => {
  return (...args2: readonly T2[]) => func(...args, ...args2);
};

export { curry, curry as default };
