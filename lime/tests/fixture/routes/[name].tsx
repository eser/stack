// Copyright 2023 the cool authors. All rights reserved. MIT license.

interface Props {
  params: Record<string, string | Array<string>>;
}

export default function Greet(props: Props) {
  return <div>Hello {props.params["name"]}</div>;
}
