import { type LayoutProps } from "$cool/lime/server.ts";

export default function TsxLayout({ Component }: LayoutProps) {
  return (
    <div className="tsx-layout">
      <Component />
    </div>
  );
}
