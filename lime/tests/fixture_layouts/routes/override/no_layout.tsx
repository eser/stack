import { type LayoutConfig } from "../../../../server.ts";

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
