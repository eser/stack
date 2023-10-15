import { view } from "../../../../../runtime.ts";

export default function JsLayout({ Component }) {
  return view.adapter.h(
    "div",
    { class: "js-layout" },
    view.adapter.h(Component, null),
  );
}
