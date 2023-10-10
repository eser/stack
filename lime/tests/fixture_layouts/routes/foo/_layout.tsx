import { type LayoutProps } from "../../../../server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div className="foo-layout">
      <Component />
    </div>
  );
}
