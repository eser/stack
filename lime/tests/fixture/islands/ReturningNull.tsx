import { view } from "../../../src/runtime/drivers/view.ts";

export default function ReturningNull() {
  view.useEffect(() => {
    const p = document.createElement("p");
    p.textContent = "Hello, null!";
    p.className = "added-by-use-effect";

    document.body.appendChild(p);
  }, []);

  return null;
}
