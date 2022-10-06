import { type Container } from "./containers.ts";

type UseContainerBuilderResult<K, V> = () => [
  (token: K, defaultValue?: V) => V | undefined,
  {
    get: (token: K, defaultValue?: V) => V | undefined;
    getMany: <K2 extends string | number | symbol>(
      ...tokens: K2[]
    ) => Record<K2, V>;
    setValue: (token: K, value: V) => void;
    setFactory: (token: K, value: () => V | undefined) => void;
  },
];

const useContainerBuilder = <K, V>(
  targetContainer: Container<K, V>,
): UseContainerBuilderResult<K, V> => {
  return () => [
    targetContainer.get,
    {
      get: targetContainer.get,
      getMany: targetContainer.getMany,
      setValue: targetContainer.setValue,
      setFactory: targetContainer.setFactory,
    },
  ];
};

export { useContainerBuilder, useContainerBuilder as default };
