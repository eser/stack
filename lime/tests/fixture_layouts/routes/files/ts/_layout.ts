import { view } from "../../../../../src/runtime/drivers/view.ts";
import { type LayoutProps } from "$cool/lime/server.ts";

export default function TsLayout({ Component }: LayoutProps) {
  return view.h("div", { class: "ts-layout" }, view.h(Component, null));
}
