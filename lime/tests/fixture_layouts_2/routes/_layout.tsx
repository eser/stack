import { LayoutProps } from "../../../server.ts";

export default function RootLayout(
  { Component }: LayoutProps<unknown>,
) {
  return (
    <div className="root-layout">
      <Component />
    </div>
  );
}
