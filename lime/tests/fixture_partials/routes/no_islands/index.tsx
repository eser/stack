import { Partial } from "$cool/lime/runtime.ts";

export default function SlotDemo() {
  return (
    <div>
      <div className="output">
        <Partial name="slot-1">
          <p>Default content</p>
        </Partial>
      </div>
      <a
        className="update-link"
        href="/no_islands/injected"
        f-partial="/no_islands/update"
      >
        update
      </a>
    </div>
  );
}
