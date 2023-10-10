import { type LayoutConfig } from "../../../../server.ts";

export const config: LayoutConfig = {
  skipAppWrapper: true,
  skipInheritedLayouts: true,
};

export default function OverridePage() {
  return (
    <p className="no-app-no-layouts">
      no <code>_app.tsx</code> template and no layouts
    </p>
  );
}
