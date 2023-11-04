import { Partial } from "../../../../runtime.ts";

export default function SlotDemo() {
  return (
    <div>
      <div className="output">
        <Partial name="slot-1">
          <p>Default content</p>
        </Partial>
      </div>
      <a
        className="handler-update-link"
        href="/isPartial/injected"
        f-partial="/isPartial/handler"
      >
        handler update
      </a>
      <br />
      <a
        className="async-update-link"
        href="/isPartial/injected"
        f-partial="/isPartial/async"
      >
        async update
      </a>
    </div>
  );
}
