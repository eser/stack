import { IS_BROWSER } from "$cool/lime/runtime.ts";
import Test from "../islands/Test.tsx";

export default function Home() {
  return (
    <div>
      <Test message="Hello!" />
      <p>{IS_BROWSER ? "Viewing browser render." : "Viewing JIT render."}</p>
    </div>
  );
}
