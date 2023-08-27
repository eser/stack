import { LayoutProps } from "$cool/lime/server.ts";

export default function BarLayout({ Component }: LayoutProps) {
  return (
    <div>
      <p class="baz-layout">Baz layout</p>
      <Component />
    </div>
  );
}
