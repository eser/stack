import { LayoutProps } from "$cool/lime/server.ts";

export default function SubLayout({ Component }: LayoutProps) {
  return (
    <div class="sub-layout">
      <Component />
    </div>
  );
}
