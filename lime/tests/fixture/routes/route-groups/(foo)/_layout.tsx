import { type LayoutProps } from "../../../../../server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="foo-layout">Foo layout</p>
      <Component />
    </div>
  );
}
