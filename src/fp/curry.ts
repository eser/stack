function curry<T1, T2, T3>(
  func: (...args: [...Array<T1>, ...Array<T2>]) => T3,
  ...args: Array<T1>
): (...args: Array<T2>) => T3 {
  return (...args2: Array<T2>) => func(...args, ...args2);
}

export { curry as default };
