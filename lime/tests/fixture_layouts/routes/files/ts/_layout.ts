import { view } from "../../../../../runtime.ts";
import { type LayoutProps } from "../../../../../server.ts";

export default function TsLayout({ Component }: LayoutProps) {
  return view.adapter.h(
    "div",
    { class: "ts-layout" },
    view.adapter.h(Component, null),
  );
}
