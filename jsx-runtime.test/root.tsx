// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// @ts-nocheck: JSX.IntrinsicElements issue.

export function SubComponent() {
  return <div>sub component</div>;
}

export interface ComponentProps {
  foo: string;
}

export function Component(props: ComponentProps) {
  return (
    <div>
      hello {props.foo}
      <br />
      <SubComponent />
    </div>
  );
}

export function Root() {
  return <Component foo="bar" lime-hack />;
}
