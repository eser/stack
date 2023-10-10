import { view } from "../../../../../runtime.ts";

export default function TsPage() {
  return view.adapter.h("div", { className: "ts-page" }, "/files/ts");
}
