// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as ansi from "./ansi.ts";
import * as tabBar from "./tab-bar.ts";

bdd.describe("renderTab", () => {
  const tab = { id: "t1", label: "Overview" };

  bdd.it("should include tab index and label", () => {
    const result = tabBar.renderTab(tab, 0, false);
    const stripped = ansi.stripAnsi(result);
    assert.assertEquals(stripped.includes("1:Overview"), true);
  });

  bdd.it("should apply inverse style for active tab", () => {
    const result = tabBar.renderTab(tab, 0, true, "inverse");
    const stripped = ansi.stripAnsi(result);
    assert.assertEquals(stripped.includes("1:Overview"), true);
    assert.assertEquals(result.includes("\x1b[7m"), true);
  });

  bdd.it("should apply dim for inactive tab", () => {
    const result = tabBar.renderTab(tab, 0, false, "inverse");
    assert.assertEquals(result.includes("\x1b[2m"), true);
  });

  bdd.it("should include badge when present", () => {
    const badgedTab = {
      id: "t2",
      label: "Log",
      badge: "3",
      badgeColor: "green" as const,
    };
    const result = tabBar.renderTab(badgedTab, 1, false);
    const stripped = ansi.stripAnsi(result);
    assert.assertEquals(stripped.includes("[3]"), true);
  });
});

bdd.describe("renderTabBar", () => {
  const tabs = [
    { id: "t1", label: "Overview" },
    { id: "t2", label: "Log" },
    { id: "t3", label: "Config" },
  ];

  bdd.it("should join tabs with separators", () => {
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth: 80,
    });
    const stripped = ansi.stripAnsi(result);
    assert.assertEquals(stripped.includes("\u2502"), true);
  });

  bdd.it("should pad to maxWidth", () => {
    const maxWidth = 80;
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth,
    });
    assert.assertEquals(ansi.visibleLength(result), maxWidth);
  });

  bdd.it("should handle empty tabs array", () => {
    const maxWidth = 40;
    const result = tabBar.renderTabBar({
      tabs: [],
      activeIndex: 0,
      maxWidth,
    });
    assert.assertEquals(result, " ".repeat(maxWidth));
  });

  bdd.it("should truncate when tabs exceed maxWidth", () => {
    const maxWidth = 20;
    const result = tabBar.renderTabBar({
      tabs,
      activeIndex: 0,
      maxWidth,
    });
    assert.assertEquals(ansi.visibleLength(result), maxWidth);
  });
});

bdd.describe("nextTab / prevTab", () => {
  bdd.it("should wrap forward", () => {
    assert.assertEquals(tabBar.nextTab(2, 3), 0);
  });

  bdd.it("should wrap backward", () => {
    assert.assertEquals(tabBar.prevTab(0, 3), 2);
  });

  bdd.it("should cycle through", () => {
    assert.assertEquals(tabBar.nextTab(0, 3), 1);
  });
});
