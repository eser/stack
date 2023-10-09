import { type ComponentChildren } from "$cool/lime/runtime.ts";

export default function Island(props: { children?: ComponentChildren }) {
  return (
    <div className="island">
      {props.children}
    </div>
  );
}
