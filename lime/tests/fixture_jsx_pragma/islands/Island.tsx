import { IS_BROWSER } from "$cool/lime/runtime.ts";

export default function Island() {
  const id = IS_BROWSER ? "csr" : "ssr";

  return (
    <div>
      <p id={id}>{id}</p>
    </div>
  );
}
