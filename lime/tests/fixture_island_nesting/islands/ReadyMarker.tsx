import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";

export function ReadyMarker() {
  const sig = useSignal(false);
  useEffect(() => {
    sig.value = true;
  }, []);

  return (
    <p className={sig.value ? "mounted" : "pending"}>
      {sig.value ? "mounted" : "pending"}
    </p>
  );
}