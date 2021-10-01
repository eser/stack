enum ServiceType {
  Singleton = "SINGLETON",
  Factory = "FACTORY",
}

declare global {
  var services: Record<string | symbol, [ServiceType, unknown]>;
}

function getService(name: string | symbol, defaultValue?: unknown): unknown {
  if (name in globalThis.services) {
    const [serviceType, value] = globalThis.services[name];

    if (serviceType === ServiceType.Factory) {
      return (value as () => unknown)();
    }

    return value;
  }

  return defaultValue;
}

function setValue(name: string | symbol, value: unknown): void {
  globalThis.services = Object.assign({}, globalThis.services, {
    [name]: [ServiceType.Singleton, value],
  });
}

function setFactory(name: string | symbol, value: () => unknown): void {
  globalThis.services = Object.assign({}, globalThis.services, {
    [name]: [ServiceType.Factory, value],
  });
}

function useServices(): [
  (name: string | symbol, defaultValue?: unknown) => unknown,
  {
    setValue: (name: string | symbol, value: unknown) => void;
    setFactory: (name: string | symbol, value: () => unknown) => void;
  },
] {
  return [
    getService,
    {
      setValue,
      setFactory,
    },
  ];
}

export {
  getService,
  setFactory,
  setValue,
  useServices,
  useServices as default,
};
