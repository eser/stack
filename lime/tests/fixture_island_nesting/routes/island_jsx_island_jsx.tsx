import { type ComponentChildren } from "../../../src/runtime/drivers/view.ts";
import Island from "../islands/Island.tsx";

function Foo(props: { children?: ComponentChildren }) {
  return (
    <div className="server">
      {props.children}
    </div>
  );
}

export default function Home() {
  return (
    <div id="page">
      <Island>
        <Foo>
          <Island>
            <Foo>
              <p>it works</p>
            </Foo>
          </Island>
        </Foo>
      </Island>
    </div>
  );
}
