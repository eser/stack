import { useEffect, useRef } from "react";
import { type ComponentChildren } from "../../../src/runtime/drivers/view.tsx";

export function FormIsland({ children }: { children: ComponentChildren }) {
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = "Revived: true";
  }, []);

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <p className="form-revived" ref={ref}>Revived: false</p>
      {children}
    </form>
  );
}
