declare global {
  var services: Record<string | symbol, unknown>;
}

function getService(name: string | symbol, defaultValue?: unknown): unknown {
  if (name in globalThis.services) {
    return globalThis.services[name];
  }

  return defaultValue;
}

function setService(name: string | symbol, value: unknown): void {
  globalThis.services = Object.assign({}, globalThis.services, {
    [name]: value,
  });
}

function useServices(): [
  (name: string | symbol, defaultValue?: unknown) => unknown,
  (name: string | symbol, value: unknown) => void,
] {
  return [
    getService,
    setService,
  ];
}

export { getService, setService, useServices, useServices as default };
