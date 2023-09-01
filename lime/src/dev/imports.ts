export const RECOMMENDED_REACT_VERSION = "18.2.0";
export const RECOMMENDED_PREACT_VERSION = "10.17.1";
export const RECOMMENDED_PREACT_RTS_VERSION = "6.2.1";
export const RECOMMENDED_PREACT_SIGNALS_VERSION = "1.2.1";
export const RECOMMENDED_PREACT_SIGNALS_CORE_VERSION = "1.4.0";
export const RECOMMENDED_PREACT_SIGNALS_REACT_VERSION = "1.3.6";
export const RECOMMENDED_STD_VERSION = "0.200.0";

export function baseImports(imports: Record<string, string>) {
  imports["$cool/"] = new URL("../../../", import.meta.url).href;
  imports["$std/"] = `https://deno.land/std@${RECOMMENDED_STD_VERSION}/`;
}

export function reactImports(imports: Record<string, string>) {
  imports["react"] = `https://esm.sh/react@${RECOMMENDED_REACT_VERSION}`;
  imports["react/"] = `https://esm.sh/*react@${RECOMMENDED_REACT_VERSION}/`;
  imports["react-dom"] =
    `https://esm.sh/react-dom@${RECOMMENDED_REACT_VERSION}?external=react`;
  imports["react-dom/"] =
    `https://esm.sh/*react-dom@${RECOMMENDED_REACT_VERSION}/`;
  imports["@preact/signals-core"] =
    `https://esm.sh/@preact/signals-core@${RECOMMENDED_PREACT_SIGNALS_CORE_VERSION}`;
  imports["@preact/signals-react"] =
    `https://esm.sh/@preact/signals-react@${RECOMMENDED_PREACT_SIGNALS_REACT_VERSION}?external=react`;
}

export function preactImports(imports: Record<string, string>) {
  imports["preact"] = `https://esm.sh/preact@${RECOMMENDED_PREACT_VERSION}`;
  imports["preact/"] = `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/`;
  imports["preact-render-to-string"] =
    `https://esm.sh/*preact-render-to-string@${RECOMMENDED_PREACT_RTS_VERSION}`;
  imports["@preact/signals"] =
    `https://esm.sh/@preact/signals@${RECOMMENDED_PREACT_SIGNALS_VERSION}?external=preact`;
  imports["@preact/signals-core"] =
    `https://esm.sh/@preact/signals-core@${RECOMMENDED_PREACT_SIGNALS_CORE_VERSION}`;
}
