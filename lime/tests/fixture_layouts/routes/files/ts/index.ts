import { view } from "../../../../../src/runtime/drivers/view.ts";

export default function TsPage() {
  return view.adapter.h("div", { className: "ts-page" }, "/files/ts");
}
