import { view } from "$cool/lime/runtime.ts";

export default function JsLayout({ Component }) {
  return view.adapter.h(
    "div",
    { class: "js-layout" },
    view.adapter.h(Component, null),
  );
}
