import { type ComponentChildren } from "react";

export default function SlotDemo() {
  return (
    <div>
      <Foo key="A">A</Foo>
      <Foo key="B">B</Foo>
      <Foo key="C">C</Foo>
    </div>
  );
}

function Foo(props: { children?: ComponentChildren }) {
  return <p>{props.children}</p>;
}
