// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as ansi from "./ansi.ts";
import * as tabBar from "./tab-bar.ts";

describe("renderTab", () => {
  const tab = { id: "t1", label: "Overview" };

  it("should include tab index and label", () => {
    const result = tabBar.renderTab(tab, 0, false);
    const stripped = ansi.stripAnsi(result);
    assertEquals(stripped.includes("1:Overview"), true);
  });

  it("should apply inverse style for active tab", () => {
    const result = tabBar.renderTab(tab, 0, true, "inverse");
    const stripped = ansi.stripAnsi(result);
    assertEquals(stripped.includes("1:Overview"), true);
    assertEquals(result.includes("\x1b[7m"), true);
  });

  it("should apply dim for inactive tab", () => {
    const result = tabBar.renderTab(tab, 0, false, "inverse");
    assertEquals(result.includes("\x1b[2m"), true);
  });

  it("should include badge when present", () => {
    const badgedTab = {
      id: "t2",
      label: "Log",
      badge: "3",
      badgeColor: "green" as const,
    };
    const result = tabBar.renderTab(badgedTab, 1, false);
    const stripped = ansi.stripAnsi(result);
    assertEquals(stripped.includes("[3]"), true);
  });
});

describe("renderTabBar", () => {
  const tabs = [
    { id: "t1", label: "Overview" },
    { id: "t2", label: "Log" },
    { id: "t3", label: "Config" },
  ];

  it("should join tabs with separators", () => {
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 80,
    });
    const stripped = ansi.stripAnsi(result);
    assertEquals(stripped.includes("\u2502"), true);
  });

  it("should pad to maxWidth", () => {
    const maxWidth = 80;
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth,
    });
    assertEquals(ansi.visibleLength(result), maxWidth);
  });

  it("should handle empty tabs array", () => {
    const maxWidth = 40;
    const result = tabBar.renderTabBar({
      tabs: [],
      activeIndex: 0,
      maxWidth,
    });
    assertEquals(result, " ".repeat(maxWidth));
  });

  it("should truncate when tabs exceed maxWidth", () => {
    const maxWidth = 20;
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth,
    });
    assertEquals(ansi.visibleLength(result), maxWidth);
  });
});

describe("nextTab / prevTab", () => {
  it("should wrap forward", () => {
    assertEquals(tabBar.nextTab(2, 3), 0);
  });

  it("should wrap backward", () => {
    assertEquals(tabBar.prevTab(0, 3), 2);
  });

  it("should cycle through", () => {
    assertEquals(tabBar.nextTab(0, 3), 1);
  });
});
