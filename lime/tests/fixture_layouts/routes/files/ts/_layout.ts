import { h } from "preact";
import { LayoutProps } from "$cool/lime/server.ts";

export default function TsLayout({ Component }: LayoutProps) {
  return h("div", { class: "ts-layout" }, h(Component, null));
}
