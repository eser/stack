// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// @ts-nocheck: JSX.IntrinsicElements issue.

export const SubComponent = () => {
  return <div>sub component</div>;
};

export interface ComponentProps {
  foo: string;
}

export const Component = (props: ComponentProps) => {
  return (
    <div>
      hello {props.foo}
      <br />
      <SubComponent />
    </div>
  );
};

export const Root = () => {
  return <Component foo="bar" lime-hack />;
};
