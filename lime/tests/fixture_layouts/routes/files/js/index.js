import { view } from "../../../../../src/runtime/drivers/view.ts";

export default function JsPage() {
  return view.adapter.h("div", { class: "js-page" }, "/files/js");
}
