// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
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
  assertEquals(COMMON_LOCALES.includes("en"), true);
  assertEquals(COMMON_LOCALES.includes("tr"), true);
  assertEquals(COMMON_LOCALES.includes("ar"), true);
  assertEquals(COMMON_LOCALES.includes("zh-CN"), true);
});

Deno.test("DEFAULT_LOCALE is en", () => {
  assertEquals(DEFAULT_LOCALE, "en");
});

Deno.test("isCommonLocale - returns true for common locales", () => {
  assertEquals(isCommonLocale("en"), true);
  assertEquals(isCommonLocale("tr"), true);
  assertEquals(isCommonLocale("zh-CN"), true);
});

Deno.test("isCommonLocale - returns false for unknown locales", () => {
  assertEquals(isCommonLocale("xx"), false);
  assertEquals(isCommonLocale("en-US"), false);
  assertEquals(isCommonLocale(""), false);
});

Deno.test("RTL_LOCALES contains expected RTL languages", () => {
  assertEquals(RTL_LOCALES.has("ar"), true);
  assertEquals(RTL_LOCALES.has("he"), true);
  assertEquals(RTL_LOCALES.has("fa"), true);
  assertEquals(RTL_LOCALES.has("ur"), true);
});

Deno.test("isRtlLocale - returns true for RTL locales", () => {
  assertEquals(isRtlLocale("ar"), true);
  assertEquals(isRtlLocale("he"), true);
  assertEquals(isRtlLocale("fa"), true);
});

Deno.test("isRtlLocale - handles regional variants", () => {
  assertEquals(isRtlLocale("ar-SA"), true);
  assertEquals(isRtlLocale("he-IL"), true);
});

Deno.test("isRtlLocale - returns false for LTR locales", () => {
  assertEquals(isRtlLocale("en"), false);
  assertEquals(isRtlLocale("tr"), false);
  assertEquals(isRtlLocale("en-US"), false);
});

Deno.test("getTextDirection - returns rtl for RTL locales", () => {
  assertEquals(getTextDirection("ar"), "rtl");
  assertEquals(getTextDirection("he"), "rtl");
  assertEquals(getTextDirection("ar-SA"), "rtl");
});

Deno.test("getTextDirection - returns ltr for LTR locales", () => {
  assertEquals(getTextDirection("en"), "ltr");
  assertEquals(getTextDirection("tr"), "ltr");
  assertEquals(getTextDirection("zh-CN"), "ltr");
});

Deno.test("parseLocale - parses simple locale", () => {
  const result = parseLocale("en");
  assertEquals(result, { language: "en", region: undefined });
});

Deno.test("parseLocale - parses locale with region", () => {
  const result = parseLocale("en-US");
  assertEquals(result, { language: "en", region: "US" });
});

Deno.test("parseLocale - parses Chinese locale", () => {
  const result = parseLocale("zh-CN");
  assertEquals(result, { language: "zh", region: "CN" });
});

Deno.test("getLanguageCode - extracts language from locale", () => {
  assertEquals(getLanguageCode("en-US"), "en");
  assertEquals(getLanguageCode("zh-CN"), "zh");
  assertEquals(getLanguageCode("fr"), "fr");
});
