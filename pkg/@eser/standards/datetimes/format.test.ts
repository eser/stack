// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import {
  getRelativeTime,
  isFuture,
  isPast,
  isToday,
  toISODate,
  toISODateTime,
} from "./format.ts";

Deno.test("toISODate - formats date correctly", () => {
  const date = new Date("2024-03-15T10:30:00Z");
  assertEquals(toISODate(date), "2024-03-15");
});

Deno.test("toISODate - handles different dates", () => {
  assertEquals(toISODate(new Date("2024-01-01T00:00:00Z")), "2024-01-01");
  assertEquals(toISODate(new Date("2024-12-31T23:59:59Z")), "2024-12-31");
});

Deno.test("toISODateTime - formats datetime correctly", () => {
  const date = new Date("2024-03-15T10:30:00.000Z");
  assertEquals(toISODateTime(date), "2024-03-15T10:30:00.000Z");
});

Deno.test("getRelativeTime - just now for < 1 minute", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:59:30Z");
  assertEquals(getRelativeTime(date, now), "just now");
});

Deno.test("getRelativeTime - minutes ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:30:00Z");
  assertEquals(getRelativeTime(date, now), "30 minutes ago");
});

Deno.test("getRelativeTime - 1 minute ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:59:00Z");
  assertEquals(getRelativeTime(date, now), "1 minute ago");
});

Deno.test("getRelativeTime - hours ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T10:00:00Z");
  assertEquals(getRelativeTime(date, now), "2 hours ago");
});

Deno.test("getRelativeTime - 1 hour ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assertEquals(getRelativeTime(date, now), "1 hour ago");
});

Deno.test("getRelativeTime - days ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-12T12:00:00Z");
  assertEquals(getRelativeTime(date, now), "3 days ago");
});

Deno.test("getRelativeTime - 1 day ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-14T12:00:00Z");
  assertEquals(getRelativeTime(date, now), "1 day ago");
});

Deno.test("getRelativeTime - in minutes (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T12:30:00Z");
  assertEquals(getRelativeTime(date, now), "in 30 minutes");
});

Deno.test("getRelativeTime - in hours (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T14:00:00Z");
  assertEquals(getRelativeTime(date, now), "in 2 hours");
});

Deno.test("getRelativeTime - in days (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-18T12:00:00Z");
  assertEquals(getRelativeTime(date, now), "in 3 days");
});

Deno.test("isToday - returns true for today", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T08:00:00Z");
  assertEquals(isToday(date, now), true);
});

Deno.test("isToday - returns false for other days", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-14T12:00:00Z");
  assertEquals(isToday(date, now), false);
});

Deno.test("isPast - returns true for past dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assertEquals(isPast(date, now), true);
});

Deno.test("isPast - returns false for future dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T13:00:00Z");
  assertEquals(isPast(date, now), false);
});

Deno.test("isFuture - returns true for future dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T13:00:00Z");
  assertEquals(isFuture(date, now), true);
});

Deno.test("isFuture - returns false for past dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assertEquals(isFuture(date, now), false);
});
