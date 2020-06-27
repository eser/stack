interface HexFunctionInput {
  platform: {
    type: string;
    name: string;
  };
  event: {
    name: string;
    [key: string]: unknown;
  };
  requestedFormat: {
    mimetype: string;
    format: string;
  };
  parameters: { [key: string]: unknown };
}

export {
  HexFunctionInput as default,
};
