import { type Container } from "./containers.ts";

type UseContainerBuilderResult<K, V> = () => [
  (name: K, defaultValue?: V) => V | undefined,
  {
    get: (name: K, defaultValue?: V) => V | undefined;
    setValue: (name: K, value: V) => void;
    setFactory: (name: K, value: () => V | undefined) => void;
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
