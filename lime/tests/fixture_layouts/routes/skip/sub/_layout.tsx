import { type LayoutProps } from "$cool/lime/server.ts";

export default function SubLayout({ Component }: LayoutProps) {
  return (
    <div className="sub-layout">
      <Component />
    </div>
  );
}
