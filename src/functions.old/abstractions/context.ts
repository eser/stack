interface HexContext {
  // deno-lint-ignore ban-types
  services: Record<string, Function | object>;
  vars: Record<string, unknown | null>;
}

export type { HexContext };
