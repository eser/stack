interface HexFunctionContext {
  services: Record<string, Function | object>;
  vars: Record<string, unknown | null>;
}

export {
  HexFunctionContext as default,
};
