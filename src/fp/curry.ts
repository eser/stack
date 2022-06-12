function curry<T1, T2, T3>(
  func: (...args: [...T1[], ...Array<T2>]) => T3,
  ...args: T1[]
): (...args: T2[]) => T3 {
  return (...args2: T2[]) => func(...args, ...args2);
}

export { curry, curry as default };
