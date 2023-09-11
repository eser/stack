import { type LayoutProps } from "$cool/lime/server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p className="foo-layout">Foo layout</p>
      <Component />
    </div>
  );
}
