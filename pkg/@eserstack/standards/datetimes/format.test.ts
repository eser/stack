// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as format from "./format.ts";

nodeTest.test("toISODate - formats date correctly", () => {
  const date = new Date("2024-03-15T10:30:00Z");
  assert.assertEquals(format.toISODate(date), "2024-03-15");
});

nodeTest.test("toISODate - handles different dates", () => {
  assert.assertEquals(
    format.toISODate(new Date("2024-01-01T00:00:00Z")),
    "2024-01-01",
  );
  assert.assertEquals(
    format.toISODate(new Date("2024-12-31T23:59:59Z")),
    "2024-12-31",
  );
});

nodeTest.test("toISODateTime - formats datetime correctly", () => {
  const date = new Date("2024-03-15T10:30:00.000Z");
  assert.assertEquals(format.toISODateTime(date), "2024-03-15T10:30:00.000Z");
});

nodeTest.test("getRelativeTime - just now for < 1 minute", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:59:30Z");
  assert.assertEquals(format.getRelativeTime(date, now), "just now");
});

nodeTest.test("getRelativeTime - minutes ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:30:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "30 minutes ago");
});

nodeTest.test("getRelativeTime - 1 minute ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:59:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "1 minute ago");
});

nodeTest.test("getRelativeTime - hours ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T10:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "2 hours ago");
});

nodeTest.test("getRelativeTime - 1 hour ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "1 hour ago");
});

nodeTest.test("getRelativeTime - days ago", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-12T12:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "3 days ago");
});

nodeTest.test("getRelativeTime - 1 day ago (singular)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-14T12:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "1 day ago");
});

nodeTest.test("getRelativeTime - in minutes (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T12:30:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "in 30 minutes");
});

nodeTest.test("getRelativeTime - in hours (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T14:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "in 2 hours");
});

nodeTest.test("getRelativeTime - in days (future)", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-18T12:00:00Z");
  assert.assertEquals(format.getRelativeTime(date, now), "in 3 days");
});

nodeTest.test("isToday - returns true for today", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T08:00:00Z");
  assert.assertEquals(format.isToday(date, now), true);
});

nodeTest.test("isToday - returns false for other days", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-14T12:00:00Z");
  assert.assertEquals(format.isToday(date, now), false);
});

nodeTest.test("isPast - returns true for past dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assert.assertEquals(format.isPast(date, now), true);
});

nodeTest.test("isPast - returns false for future dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T13:00:00Z");
  assert.assertEquals(format.isPast(date, now), false);
});

nodeTest.test("isFuture - returns true for future dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T13:00:00Z");
  assert.assertEquals(format.isFuture(date, now), true);
});

nodeTest.test("isFuture - returns false for past dates", () => {
  const now = new Date("2024-03-15T12:00:00Z");
  const date = new Date("2024-03-15T11:00:00Z");
  assert.assertEquals(format.isFuture(date, now), false);
});
