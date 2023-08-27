export const RECOMMENDED_REACT_VERSION = "18.2.0";
export const RECOMMENDED_PREACT_VERSION = "10.17.1";
export const RECOMMENDED_PREACT_RTS_VERSION = "6.2.1";
export const RECOMMENDED_PREACT_SIGNALS_VERSION = "1.2.1";
export const RECOMMENDED_PREACT_SIGNALS_CORE_VERSION = "1.4.0";
export const RECOMMENDED_STD_VERSION = "0.200.0";

export function baseImports(imports: Record<string, string>) {
  imports["$cool/"] = new URL("../../../", import.meta.url).href;
  imports["$std/"] = `https://deno.land/std@${RECOMMENDED_STD_VERSION}/`;
}

export function reactImports(imports: Record<string, string>) {
  imports["react"] =
    `https://esm.sh/react@${RECOMMENDED_REACT_VERSION}?target=deno`;
  imports["react/jsx-runtime"] =
    `https://esm.sh/*react@${RECOMMENDED_REACT_VERSION}/jsx-runtime?target=deno`;
  imports["react-dom"] =
    `https://esm.sh/react-dom@${RECOMMENDED_REACT_VERSION}?target=deno&external=react`;
  imports["react-dom/server"] =
    `https://esm.sh/*react-dom@${RECOMMENDED_REACT_VERSION}/server?target=deno&external=react`;
}

export function preactImports(imports: Record<string, string>) {
  imports["preact"] =
    `https://esm.sh/preact@${RECOMMENDED_PREACT_VERSION}?target=deno`;
  imports["preact/compat"] =
    `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/compat?target=deno`;
  imports["preact/debug"] =
    `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/debug?target=deno`;
  imports["preact/devtools"] =
    `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/devtools?target=deno`;
  imports["preact/jsx-runtime"] =
    `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/jsx-runtime?target=deno`;
  imports["preact/hooks"] =
    `https://esm.sh/*preact@${RECOMMENDED_PREACT_VERSION}/hooks?target=deno`;
  imports["preact-render-to-string"] =
    `https://esm.sh/*preact-render-to-string@${RECOMMENDED_PREACT_RTS_VERSION}?target=deno`;
  imports["@preact/signals"] =
    `https://esm.sh/*@preact/signals@${RECOMMENDED_PREACT_SIGNALS_VERSION}?target=deno`;
  imports["@preact/signals-core"] =
    `https://esm.sh/@preact/signals-core@${RECOMMENDED_PREACT_SIGNALS_CORE_VERSION}?target=deno`;
}
