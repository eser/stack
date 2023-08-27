import { LayoutConfig, LayoutProps } from "$cool/lime/server.ts";

export const config: LayoutConfig = {
  skipAppWrapper: true,
};

export default function OverrideLayout({ Component }: LayoutProps) {
  return (
    <div class="no-app-layout">
      <Component />
    </div>
  );
}
