import { useSignal } from "@preact/signals-react";
import { Partial } from "../../../../runtime.ts";
import Spinner from "../../islands/Spinner.tsx";
import PartialTrigger from "../../islands/PartialTrigger.tsx";

export default function SlotDemo() {
  const sig = useSignal(false);
  return (
    <div>
      <div className="output">
        <Partial name="slot-1">
          <p className="status">Default content</p>
          <Spinner id="inner" show={sig} />
        </Partial>
      </div>
      <Spinner id="outer" show={sig} />
      <a
        className="update-link"
        href="/loading/injected"
        f-partial="/loading/update"
        f-loading={sig}
      >
        update
      </a>
      <br />
      <PartialTrigger
        className="trigger"
        href="/loading/injected"
        partial="/loading/update"
        loading={sig}
      >
        partial trigger
      </PartialTrigger>
    </div>
  );
}
