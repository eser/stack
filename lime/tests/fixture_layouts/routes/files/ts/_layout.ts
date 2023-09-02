import { view } from "../../../../../src/runtime/drivers/view.ts";
import { type LayoutProps } from "$cool/lime/server.ts";

export default function TsLayout({ Component }: LayoutProps) {
  return view.adapter.h(
    "div",
    { class: "ts-layout" },
    view.adapter.h(Component, null),
  );
}
