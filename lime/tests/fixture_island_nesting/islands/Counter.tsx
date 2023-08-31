import { Signal } from "@preact/signals";

export default function Counter({ count }: { count: Signal<number> }) {
  return (
    <div>
      <p className="count">{count}</p>
      <button className="counter" onClick={() => count.value++}>update</button>
    </div>
  );
}
