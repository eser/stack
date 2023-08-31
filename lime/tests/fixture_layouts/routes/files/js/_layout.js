import { view } from "../../../../../src/runtime/drivers/view.ts";

export default function JsLayout({ Component }) {
  return view.h("div", { class: "js-layout" }, view.h(Component, null));
}
