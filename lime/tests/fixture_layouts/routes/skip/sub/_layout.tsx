import { type LayoutProps } from "../../../../../server.ts";

export default function SubLayout({ Component }: LayoutProps) {
  return (
    <div className="sub-layout">
      <Component />
    </div>
  );
}
