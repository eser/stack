import { view } from "../../../src/runtime/drivers/view.ts";

export default function Test() {
  view.useEffect(() => {
    document.getElementById("foo")!.textContent = "it works";
  }, []);

  return (
    <p id="foo">
      it doesn't work
    </p>
  );
}
