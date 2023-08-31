import { type LayoutConfig, type LayoutProps } from "$cool/lime/server.ts";

export const config: LayoutConfig = {
  skipInheritedLayouts: true,
};

export default function OverrideLayout({ Component }: LayoutProps) {
  return (
    <div className="override-layout">
      <Component />
    </div>
  );
}
