import { view } from "../../../../../runtime.ts";

export default function JsPage() {
  return view.adapter.h("div", { class: "js-page" }, "/files/js");
}
