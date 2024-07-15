// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as config from "./mod.ts";

// TODO FileLoader: constructor'u transformer alacak, CONSTANTS veya AS_IS gibi.
// TODO FileLoader.File: config file'ları "json", "toml", "yaml" ve ".env" gibi farklı formatlarda olabilecekler.
// TODO FileLoader.FileStack: config file'lar bir load order ile environment'a göre farklı stackler oluşturabilecekler.
// TODO FileLoader.FileStack: olmayan dosyalar atlanabilecek.

// TODO: Config Source FileLoader: FileLoader kullanan bir config source olacak.
// TODO: Config Source Environment: Environment variable'ları kullanan bir config source olacak.
// TODO: her config source'un kendini refresh ettiği bir TTL'si olacak (default: infinite0, bir süre geçtikten sonra veya invalidate() komutu ile bu resetlenebilecek.

Deno.test("new Config", () => {
  const result = new config.Config();

  assert.assertInstanceOf(result, config.Config);
});

Deno.test("setting config meta", () => {
  const result = new config.Config();

  result.setKeyMeta("sampleKey", {
    description: "sample description",
    type: "string",
    ttl: 1000,
    disallowSource: ["env"],
  });

  assert.assertInstanceOf(result, config.Config);
});
