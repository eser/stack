import { view } from "../../../../../src/runtime/drivers/view.ts";

export default function JsLayout({ Component }) {
  return view.adapter.h(
    "div",
    { class: "js-layout" },
    view.adapter.h(Component, null),
  );
}
