import { view } from "$cool/lime/runtime.ts";

export default function JsPage() {
  return view.adapter.h("div", { class: "js-page" }, "/files/js");
}
