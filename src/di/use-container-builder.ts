import { type Container } from "./containers.ts";

type UseContainerBuilderResult<K, V> = () => [
  <V2 = V>(token: K, defaultValue?: V2) => V2 | undefined,
  {
    get: <V2 = V>(
      token: K,
      defaultValue?: V2,
    ) => Promise<V2 | undefined> | V2 | undefined;
    getMany: <K2 extends string | number | symbol>(
      ...tokens: K2[]
    ) => Promise<Record<K2, V | undefined>> | Record<K2, V | undefined>;
    setValue: (token: K, value: V) => void;
    setValueLazy: (token: K, value: () => V | undefined) => void;
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
      setValueLazy: targetContainer.setValueLazy,
      setFactory: targetContainer.setFactory,
    },
  ];
};

export { useContainerBuilder, useContainerBuilder as default };
