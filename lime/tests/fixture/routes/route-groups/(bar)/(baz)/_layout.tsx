import { type LayoutProps } from "../../../../../../server.ts";

export default function BarLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="baz-layout">Baz layout</p>
      <Component />
    </div>
  );
}
