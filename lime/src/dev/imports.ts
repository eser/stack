export const RECOMMENDED_REACT_VERSION = "18.2.0";
export const RECOMMENDED_PREACT_SIGNALS_CORE_VERSION = "1.5.0";
export const RECOMMENDED_PREACT_SIGNALS_REACT_VERSION = "1.3.6";
export const RECOMMENDED_STD_VERSION = "0.204.0";

export function baseImports(imports: Record<string, string>) {
  imports["$cool/"] = new URL("../../../", import.meta.url).href;
  imports["$std/"] = `https://deno.land/std@${RECOMMENDED_STD_VERSION}/`;
}

export function reactImports(imports: Record<string, string>) {
  imports["react"] = `npm:react@${RECOMMENDED_REACT_VERSION}`;
  imports["react/"] = `npm:/react@${RECOMMENDED_REACT_VERSION}/`;
  imports["react-dom"] = `npm:react-dom@${RECOMMENDED_REACT_VERSION}`;
  imports["react-dom/"] = `npm:/react-dom@${RECOMMENDED_REACT_VERSION}/`;
  imports["@preact/signals-core"] =
    `npm:@preact/signals-core@${RECOMMENDED_PREACT_SIGNALS_CORE_VERSION}`;
  imports["@preact/signals-react"] =
    `npm:@preact/signals-react@${RECOMMENDED_PREACT_SIGNALS_REACT_VERSION}`;
}
