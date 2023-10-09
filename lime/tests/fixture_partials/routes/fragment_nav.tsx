import { Partial } from "$cool/lime/runtime.ts";

export default function SlotDemo() {
  return (
    <div>
      <h1 id="foo">Same nav</h1>
      <a href="#foo">#foo</a>
      <Partial name="foo">
        <p className="partial-text">
          foo partial
        </p>
      </Partial>
    </div>
  );
}
