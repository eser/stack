import { type LayoutProps } from "$cool/lime/server.ts";
import { type LayoutState } from "./_middleware.ts";

export default function RootLayout(
  { Component, state }: LayoutProps<unknown, LayoutState>,
) {
  return (
    <div className="root-layout">
      {state.something === "it works" ? "it works\n" : "it doesn't work\n"}
      <Component />
    </div>
  );
}
