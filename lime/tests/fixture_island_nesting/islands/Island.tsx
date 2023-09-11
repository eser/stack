import { type ComponentChildren } from "../../../src/runtime/drivers/view.ts";

export default function Island(props: { children?: ComponentChildren }) {
  return (
    <div className="island">
      {props.children}
    </div>
  );
}
