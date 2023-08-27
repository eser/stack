import { LayoutConfig } from "$cool/lime/server.ts";

export const config: LayoutConfig = {
  skipInheritedLayouts: true,
};

export default function OverridePage() {
  return (
    <p class="no-layouts">
      no layouts
    </p>
  );
}
