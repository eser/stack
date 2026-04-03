// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as scrollContainer from "./scroll-container.ts";

describe("createScrollState", () => {
  it("should initialize with offset 0", () => {
    const state = scrollContainer.createScrollState(100, 10);
    assertEquals(state.offset, 0);
  });

  it("should store contentHeight and viewportHeight", () => {
    const state = scrollContainer.createScrollState(100, 10);
    assertEquals(state.contentHeight, 100);
    assertEquals(state.viewportHeight, 10);
  });
});

describe("scrollReducer", () => {
  it("should scroll down by 1", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "down");
    assertEquals(next.offset, 1);
  });

  it("should scroll up by 1", () => {
    const state = { ...scrollContainer.createScrollState(100, 10), offset: 5 };
    const next = scrollContainer.scrollReducer(state, "up");
    assertEquals(next.offset, 4);
  });

  it("should clamp down to max offset", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 90,
    };
    const next = scrollContainer.scrollReducer(state, "down");
    assertEquals(next.offset, 90);
  });

  it("should clamp up to 0", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "up");
    assertEquals(next.offset, 0);
  });

  it("should page down by viewportHeight", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "pageDown");
    assertEquals(next.offset, 10);
  });

  it("should page up by viewportHeight", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 20,
    };
    const next = scrollContainer.scrollReducer(state, "pageUp");
    assertEquals(next.offset, 10);
  });

  it("should go home (offset 0)", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 50,
    };
    const next = scrollContainer.scrollReducer(state, "home");
    assertEquals(next.offset, 0);
  });

  it("should go end (offset = contentHeight - viewportHeight)", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "end");
    assertEquals(next.offset, 90);
  });

  it("should handle content smaller than viewport", () => {
    const state = scrollContainer.createScrollState(5, 10);

    assertEquals(scrollContainer.scrollReducer(state, "down").offset, 0);
    assertEquals(scrollContainer.scrollReducer(state, "up").offset, 0);
    assertEquals(scrollContainer.scrollReducer(state, "pageDown").offset, 0);
    assertEquals(scrollContainer.scrollReducer(state, "pageUp").offset, 0);
    assertEquals(scrollContainer.scrollReducer(state, "home").offset, 0);
    assertEquals(scrollContainer.scrollReducer(state, "end").offset, 0);
  });
});

describe("ensureVisible", () => {
  it("should scroll down when index below viewport", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.ensureVisible(state, 15);
    assertEquals(next.offset, 6);
  });

  it("should scroll up when index above viewport", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 20,
    };
    const next = scrollContainer.ensureVisible(state, 5);
    assertEquals(next.offset, 5);
  });

  it("should not change when index already visible", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 10,
    };
    const next = scrollContainer.ensureVisible(state, 15);
    assertEquals(next.offset, 10);
    assertEquals(next, state);
  });
});

describe("visibleRange", () => {
  it("should return correct range", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 5,
    };
    const range = scrollContainer.visibleRange(state);
    assertEquals(range.start, 5);
    assertEquals(range.end, 15);
  });

  it("should clamp end to contentHeight", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 95,
    };
    const range = scrollContainer.visibleRange(state);
    assertEquals(range.start, 95);
    assertEquals(range.end, 100);
  });
});

describe("renderScrollbar", () => {
  it("should return non-empty string", () => {
    const panel = { x: 0, y: 0, width: 40, height: 20 };
    const state = {
      ...scrollContainer.createScrollState(100, 20),
      offset: 0,
    };
    const result = scrollContainer.renderScrollbar(panel, state);
    assertEquals(result.length > 0, true);
  });

  it("should contain ANSI escape sequences", () => {
    const panel = { x: 0, y: 0, width: 40, height: 20 };
    const state = {
      ...scrollContainer.createScrollState(100, 20),
      offset: 0,
    };
    const result = scrollContainer.renderScrollbar(panel, state);
    assertEquals(result.includes("\x1b["), true);
  });
});
