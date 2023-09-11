import { type LayoutProps } from "$cool/lime/server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div className="foo-layout">
      <Component />
    </div>
  );
}
