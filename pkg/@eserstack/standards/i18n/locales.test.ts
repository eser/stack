// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as locales from "./locales.ts";

Deno.test("COMMON_LOCALES contains expected locales", () => {
  assert.assertEquals(locales.COMMON_LOCALES.includes("en"), true);
  assert.assertEquals(locales.COMMON_LOCALES.includes("tr"), true);
  assert.assertEquals(locales.COMMON_LOCALES.includes("ar"), true);
  assert.assertEquals(locales.COMMON_LOCALES.includes("zh-CN"), true);
});

Deno.test("DEFAULT_LOCALE is en", () => {
  assert.assertEquals(locales.DEFAULT_LOCALE, "en");
});

Deno.test("isCommonLocale - returns true for common locales", () => {
  assert.assertEquals(locales.isCommonLocale("en"), true);
  assert.assertEquals(locales.isCommonLocale("tr"), true);
  assert.assertEquals(locales.isCommonLocale("zh-CN"), true);
});

Deno.test("isCommonLocale - returns false for unknown locales", () => {
  assert.assertEquals(locales.isCommonLocale("xx"), false);
  assert.assertEquals(locales.isCommonLocale("en-US"), false);
  assert.assertEquals(locales.isCommonLocale(""), false);
});

Deno.test("RTL_LOCALES contains expected RTL languages", () => {
  assert.assertEquals(locales.RTL_LOCALES.has("ar"), true);
  assert.assertEquals(locales.RTL_LOCALES.has("he"), true);
  assert.assertEquals(locales.RTL_LOCALES.has("fa"), true);
  assert.assertEquals(locales.RTL_LOCALES.has("ur"), true);
});

Deno.test("isRtlLocale - returns true for RTL locales", () => {
  assert.assertEquals(locales.isRtlLocale("ar"), true);
  assert.assertEquals(locales.isRtlLocale("he"), true);
  assert.assertEquals(locales.isRtlLocale("fa"), true);
});

Deno.test("isRtlLocale - handles regional variants", () => {
  assert.assertEquals(locales.isRtlLocale("ar-SA"), true);
  assert.assertEquals(locales.isRtlLocale("he-IL"), true);
});

Deno.test("isRtlLocale - returns false for LTR locales", () => {
  assert.assertEquals(locales.isRtlLocale("en"), false);
  assert.assertEquals(locales.isRtlLocale("tr"), false);
  assert.assertEquals(locales.isRtlLocale("en-US"), false);
});

Deno.test("getTextDirection - returns rtl for RTL locales", () => {
  assert.assertEquals(locales.getTextDirection("ar"), "rtl");
  assert.assertEquals(locales.getTextDirection("he"), "rtl");
  assert.assertEquals(locales.getTextDirection("ar-SA"), "rtl");
});

Deno.test("getTextDirection - returns ltr for LTR locales", () => {
  assert.assertEquals(locales.getTextDirection("en"), "ltr");
  assert.assertEquals(locales.getTextDirection("tr"), "ltr");
  assert.assertEquals(locales.getTextDirection("zh-CN"), "ltr");
});

Deno.test("parseLocale - parses simple locale", () => {
  const result = locales.parseLocale("en");
  assert.assertEquals(result, { language: "en", region: undefined });
});

Deno.test("parseLocale - parses locale with region", () => {
  const result = locales.parseLocale("en-US");
  assert.assertEquals(result, { language: "en", region: "US" });
});

Deno.test("parseLocale - parses Chinese locale", () => {
  const result = locales.parseLocale("zh-CN");
  assert.assertEquals(result, { language: "zh", region: "CN" });
});

Deno.test("getLanguageCode - extracts language from locale", () => {
  assert.assertEquals(locales.getLanguageCode("en-US"), "en");
  assert.assertEquals(locales.getLanguageCode("zh-CN"), "zh");
  assert.assertEquals(locales.getLanguageCode("fr"), "fr");
});
