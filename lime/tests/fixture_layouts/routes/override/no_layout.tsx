import { type LayoutConfig } from "$cool/lime/server.ts";

export const config: LayoutConfig = {
  skipInheritedLayouts: true,
};

export default function OverridePage() {
  return (
    <p className="no-layouts">
      no layouts
    </p>
  );
}
