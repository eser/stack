export const RECOMMENDED_REACT_VERSION = "18.2.0";
export const RECOMMENDED_PREACT_VERSION = "10.17.1";
export const RECOMMENDED_PREACT_RTS_VERSION = "6.2.1";
export const RECOMMENDED_PREACT_SIGNALS_VERSION = "1.2.1";
export const RECOMMENDED_PREACT_SIGNALS_CORE_VERSION = "1.4.0";
export const RECOMMENDED_PREACT_SIGNALS_REACT_VERSION = "1.3.6";
export const RECOMMENDED_STD_VERSION = "0.203.0";

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

export function preactImports(imports: Record<string, string>) {
  imports["preact"] = `npm:preact@${RECOMMENDED_PREACT_VERSION}`;
  imports["preact/"] = `npm:/preact@${RECOMMENDED_PREACT_VERSION}/`;
  imports["preact-render-to-string"] =
    `npm:preact-render-to-string@${RECOMMENDED_PREACT_RTS_VERSION}`;
  imports["@preact/signals"] =
    `npm:@preact/signals@${RECOMMENDED_PREACT_SIGNALS_VERSION}`;
  imports["@preact/signals-core"] =
    `npm:@preact/signals-core@${RECOMMENDED_PREACT_SIGNALS_CORE_VERSION}`;
}
