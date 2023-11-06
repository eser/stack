// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { Head } from "../../../runtime.ts";
import { type AppProps } from "../../../server.ts";

export type TestState = {
  root: string;
  stateInProps: string;
};

export default function App(props: AppProps<unknown, TestState>) {
  const statefulValue = props.state?.root === "root_mw"
    ? "The coolest framework!"
    : "";
  const specialCase = props.state?.stateInProps;
  return (
    <>
      <Head>
        <meta name="description" content="Hello world!" />
        <meta name="generator" content={statefulValue} />
        {specialCase && <meta name="specialTag" content={specialCase} />}
      </Head>
      <props.Component />
    </>
  );
}
