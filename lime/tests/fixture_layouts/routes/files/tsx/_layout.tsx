import { h } from "preact";
import { LayoutProps } from "$cool/lime/server.ts";

export default function TsxLayout({ Component }: LayoutProps) {
  return (
    <div class="tsx-layout">
      <Component />
    </div>
  );
}
