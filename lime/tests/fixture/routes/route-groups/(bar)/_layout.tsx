import { type LayoutProps } from "../../../../../server.ts";

export default function BarLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="bar-layout">Bar layout</p>
      <Component />
    </div>
  );
}
