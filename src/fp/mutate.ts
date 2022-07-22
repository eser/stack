function mutate<T>(
  instance: T,
  mutator: (draft: T) => void,
): T {
  const newInstance = structuredClone(instance);

  mutator(newInstance);

  return newInstance;
}

export { mutate, mutate as default };
