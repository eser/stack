interface HexFunctionResultBody {
  payload?: unknown;
}

type HexFunctionResult = Promise<HexFunctionResultBody | void>;

export {
  HexFunctionResult as default,
  HexFunctionResultBody,
};
