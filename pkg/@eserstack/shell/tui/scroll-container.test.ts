// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as scrollContainer from "./scroll-container.ts";

bdd.describe("createScrollState", () => {
  bdd.it("should initialize with offset 0", () => {
    const state = scrollContainer.createScrollState(100, 10);
    assert.assertEquals(state.offset, 0);
  });

  bdd.it("should store contentHeight and viewportHeight", () => {
    const state = scrollContainer.createScrollState(100, 10);
    assert.assertEquals(state.contentHeight, 100);
    assert.assertEquals(state.viewportHeight, 10);
  });
});

bdd.describe("scrollReducer", () => {
  bdd.it("should scroll down by 1", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "down");
    assert.assertEquals(next.offset, 1);
  });

  bdd.it("should scroll up by 1", () => {
    const state = { ...scrollContainer.createScrollState(100, 10), offset: 5 };
    const next = scrollContainer.scrollReducer(state, "up");
    assert.assertEquals(next.offset, 4);
  });

  bdd.it("should clamp down to max offset", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 90,
    };
    const next = scrollContainer.scrollReducer(state, "down");
    assert.assertEquals(next.offset, 90);
  });

  bdd.it("should clamp up to 0", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "up");
    assert.assertEquals(next.offset, 0);
  });

  bdd.it("should page down by viewportHeight", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "pageDown");
    assert.assertEquals(next.offset, 10);
  });

  bdd.it("should page up by viewportHeight", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 20,
    };
    const next = scrollContainer.scrollReducer(state, "pageUp");
    assert.assertEquals(next.offset, 10);
  });

  bdd.it("should go home (offset 0)", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 50,
    };
    const next = scrollContainer.scrollReducer(state, "home");
    assert.assertEquals(next.offset, 0);
  });

  bdd.it("should go end (offset = contentHeight - viewportHeight)", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.scrollReducer(state, "end");
    assert.assertEquals(next.offset, 90);
  });

  bdd.it("should handle content smaller than viewport", () => {
    const state = scrollContainer.createScrollState(5, 10);

    assert.assertEquals(scrollContainer.scrollReducer(state, "down").offset, 0);
    assert.assertEquals(scrollContainer.scrollReducer(state, "up").offset, 0);
    assert.assertEquals(
      scrollContainer.scrollReducer(state, "pageDown").offset,
      0,
    );
    assert.assertEquals(
      scrollContainer.scrollReducer(state, "pageUp").offset,
      0,
    );
    assert.assertEquals(scrollContainer.scrollReducer(state, "home").offset, 0);
    assert.assertEquals(scrollContainer.scrollReducer(state, "end").offset, 0);
  });
});

bdd.describe("ensureVisible", () => {
  bdd.it("should scroll down when index below viewport", () => {
    const state = scrollContainer.createScrollState(100, 10);
    const next = scrollContainer.ensureVisible(state, 15);
    assert.assertEquals(next.offset, 6);
  });

  bdd.it("should scroll up when index above viewport", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 20,
    };
    const next = scrollContainer.ensureVisible(state, 5);
    assert.assertEquals(next.offset, 5);
  });

  bdd.it("should not change when index already visible", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 10,
    };
    const next = scrollContainer.ensureVisible(state, 15);
    assert.assertEquals(next.offset, 10);
    assert.assertEquals(next, state);
  });
});

bdd.describe("visibleRange", () => {
  bdd.it("should return correct range", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 5,
    };
    const range = scrollContainer.visibleRange(state);
    assert.assertEquals(range.start, 5);
    assert.assertEquals(range.end, 15);
  });

  bdd.it("should clamp end to contentHeight", () => {
    const state = {
      ...scrollContainer.createScrollState(100, 10),
      offset: 95,
    };
    const range = scrollContainer.visibleRange(state);
    assert.assertEquals(range.start, 95);
    assert.assertEquals(range.end, 100);
  });
});

bdd.describe("renderScrollbar", () => {
  bdd.it("should return non-empty string", () => {
    const panel = { x: 0, y: 0, width: 40, height: 20 };
    const state = {
      ...scrollContainer.createScrollState(100, 20),
      offset: 0,
    };
    const result = scrollContainer.renderScrollbar(panel, state);
    assert.assertEquals(result.length > 0, true);
  });

  bdd.it("should contain ANSI escape sequences", () => {
    const panel = { x: 0, y: 0, width: 40, height: 20 };
    const state = {
      ...scrollContainer.createScrollState(100, 20),
      offset: 0,
    };
    const result = scrollContainer.renderScrollbar(panel, state);
    assert.assertEquals(result.includes("\x1b["), true);
  });
});
