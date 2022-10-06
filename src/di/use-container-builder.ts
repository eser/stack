import { type Container } from "./containers.ts";

type UseContainerBuilderResult<K, V> = () => [
  (token: K, defaultValue?: V) => V | undefined,
  {
    get: (token: K, defaultValue?: V) => V | undefined;
    setValue: (token: K, value: V) => void;
    setFactory: (token: K, value: () => V | undefined) => void;
  },
];

const useContainerBuilder = function useContainerBuilder<K, V>(
  targetContainer: Container<K, V>,
): UseContainerBuilderResult<K, V> {
  return () => [
    targetContainer.get,
    {
      get: targetContainer.get,
      setValue: targetContainer.setValue,
      setFactory: targetContainer.setFactory,
    },
  ];
};

export { useContainerBuilder, useContainerBuilder as default };
