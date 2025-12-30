// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import {
  COMMON_LOCALES,
  DEFAULT_LOCALE,
  getLanguageCode,
  getTextDirection,
  isCommonLocale,
  isRtlLocale,
  parseLocale,
  RTL_LOCALES,
} from "./locales.ts";

Deno.test("COMMON_LOCALES contains expected locales", () => {
  assert.assertEquals(COMMON_LOCALES.includes("en"), true);
  assert.assertEquals(COMMON_LOCALES.includes("tr"), true);
  assert.assertEquals(COMMON_LOCALES.includes("ar"), true);
  assert.assertEquals(COMMON_LOCALES.includes("zh-CN"), true);
});

Deno.test("DEFAULT_LOCALE is en", () => {
  assert.assertEquals(DEFAULT_LOCALE, "en");
});

Deno.test("isCommonLocale - returns true for common locales", () => {
  assert.assertEquals(isCommonLocale("en"), true);
  assert.assertEquals(isCommonLocale("tr"), true);
  assert.assertEquals(isCommonLocale("zh-CN"), true);
});

Deno.test("isCommonLocale - returns false for unknown locales", () => {
  assert.assertEquals(isCommonLocale("xx"), false);
  assert.assertEquals(isCommonLocale("en-US"), false);
  assert.assertEquals(isCommonLocale(""), false);
});

Deno.test("RTL_LOCALES contains expected RTL languages", () => {
  assert.assertEquals(RTL_LOCALES.has("ar"), true);
  assert.assertEquals(RTL_LOCALES.has("he"), true);
  assert.assertEquals(RTL_LOCALES.has("fa"), true);
  assert.assertEquals(RTL_LOCALES.has("ur"), true);
});

Deno.test("isRtlLocale - returns true for RTL locales", () => {
  assert.assertEquals(isRtlLocale("ar"), true);
  assert.assertEquals(isRtlLocale("he"), true);
  assert.assertEquals(isRtlLocale("fa"), true);
});

Deno.test("isRtlLocale - handles regional variants", () => {
  assert.assertEquals(isRtlLocale("ar-SA"), true);
  assert.assertEquals(isRtlLocale("he-IL"), true);
});

Deno.test("isRtlLocale - returns false for LTR locales", () => {
  assert.assertEquals(isRtlLocale("en"), false);
  assert.assertEquals(isRtlLocale("tr"), false);
  assert.assertEquals(isRtlLocale("en-US"), false);
});

Deno.test("getTextDirection - returns rtl for RTL locales", () => {
  assert.assertEquals(getTextDirection("ar"), "rtl");
  assert.assertEquals(getTextDirection("he"), "rtl");
  assert.assertEquals(getTextDirection("ar-SA"), "rtl");
});

Deno.test("getTextDirection - returns ltr for LTR locales", () => {
  assert.assertEquals(getTextDirection("en"), "ltr");
  assert.assertEquals(getTextDirection("tr"), "ltr");
  assert.assertEquals(getTextDirection("zh-CN"), "ltr");
});

Deno.test("parseLocale - parses simple locale", () => {
  const result = parseLocale("en");
  assert.assertEquals(result, { language: "en", region: undefined });
});

Deno.test("parseLocale - parses locale with region", () => {
  const result = parseLocale("en-US");
  assert.assertEquals(result, { language: "en", region: "US" });
});

Deno.test("parseLocale - parses Chinese locale", () => {
  const result = parseLocale("zh-CN");
  assert.assertEquals(result, { language: "zh", region: "CN" });
});

Deno.test("getLanguageCode - extracts language from locale", () => {
  assert.assertEquals(getLanguageCode("en-US"), "en");
  assert.assertEquals(getLanguageCode("zh-CN"), "zh");
  assert.assertEquals(getLanguageCode("fr"), "fr");
});
