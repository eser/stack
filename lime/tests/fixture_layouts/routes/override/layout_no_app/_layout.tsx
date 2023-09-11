import { type LayoutConfig, type LayoutProps } from "$cool/lime/server.ts";

export const config: LayoutConfig = {
  skipAppWrapper: true,
};

export default function OverrideLayout({ Component }: LayoutProps) {
  return (
    <div className="no-app-layout">
      <Component />
    </div>
  );
}