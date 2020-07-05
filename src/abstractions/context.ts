interface HexContext {
  services: Record<string, Function | object>;
  vars: Record<string, unknown | null>;
}

export {
  HexContext as default,
};
