// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Handlers, type PageProps } from "../../../../server.ts";
import { type TestState } from "../_app.tsx";

export const handler: Handlers<boolean> = {
  GET(_req, ctx) {
    const complexValue = true;
    return ctx.render(complexValue);
  },
};

export default function Page(props: PageProps<boolean, TestState>) {
  let valueFromState = props.state.stateInProps;
  if (props.data) {
    valueFromState = valueFromState.toUpperCase();
  }
  return (
    <div>
      <h1>{valueFromState}</h1>
    </div>
  );
}
