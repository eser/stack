// Copyright 2023 the cool authors. All rights reserved. MIT license.

export const RECOMMENDED_STD_VERSION = "0.205.0";

export function baseImports(imports: Record<string, string>) {
  imports["$cool/"] = new URL("../../../", import.meta.url).href;
  imports["$std/"] = `https://deno.land/std@${RECOMMENDED_STD_VERSION}/`;
}
