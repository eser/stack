// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { view } from "../../../runtime.ts";

// FIXME(@eser): Is it a good implementation?
class ErrorBoundary extends view.adapter.Component {
  override state = { error: null } as { error: Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    return this.state.error
      ? <p>{this.state.error.message}</p>
      : <>{this.props.children}</>;
  }
}

function Thrower(): JSX.Element {
  throw new Error("it works");
}

export default function ErrorBoundaryPage() {
  return (
    <ErrorBoundary>
      <Thrower />
    </ErrorBoundary>
  );
}
