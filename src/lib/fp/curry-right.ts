const curryRight = <T1, T2, T3>(
  func: (...args: readonly [...readonly T1[], ...Array<T2>]) => T3,
  ...args: readonly T2[]
): (...args: readonly T1[]) => T3 => {
  return (...args2: readonly T1[]) => func(...args2, ...args);
};

export { curryRight, curryRight as default };
