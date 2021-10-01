function curryRight<T1, T2, T3>(
  func: (...args: [...Array<T1>, ...Array<T2>]) => T3,
  ...args: Array<T2>
): (...args: Array<T1>) => T3 {
  return (...args2: Array<T1>) => func(...args2, ...args);
}

export { curryRight as default };
