// deno-lint-ignore no-explicit-any
interface HexFunctionInput<T = Record<string | number | symbol, any>> {
  platform: {
    type: string;
    name: string;
  };
  event: Record<string, unknown> & { name: string };
  requestedFormat: {
    mimetype: string;
    format: string;
  };
  parameters: T;
}

export { type HexFunctionInput, type HexFunctionInput as default };
