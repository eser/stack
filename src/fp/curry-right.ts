function curryRight<T1, T2, T3>(
  func: (...args: [...T1[], ...Array<T2>]) => T3,
  ...args: T2[]
): (...args: T1[]) => T3 {
  return (...args2: T1[]) => func(...args2, ...args);
}

export { curryRight, curryRight as default };
