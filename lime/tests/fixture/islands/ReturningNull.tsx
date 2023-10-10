import { view } from "../../../runtime.ts";

export default function ReturningNull() {
  view.adapter.useEffect(() => {
    const p = document.createElement("p");
    p.textContent = "Hello, null!";
    p.className = "added-by-use-effect";

    document.body.appendChild(p);
  }, []);

  return null;
}
