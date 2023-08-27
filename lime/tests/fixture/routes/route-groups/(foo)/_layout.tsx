import { LayoutProps } from "$cool/lime/server.ts";

export default function FooLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p class="foo-layout">Foo layout</p>
      <Component />
    </div>
  );
}
