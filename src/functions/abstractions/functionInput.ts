interface HexFunctionInput {
  platform: {
    type: string;
    name: string;
  };
  event: Record<string, unknown> & { name: string };
  requestedFormat: {
    mimetype: string;
    format: string;
  };
  parameters: Record<string, unknown>;
}

export type {
  HexFunctionInput,
};
