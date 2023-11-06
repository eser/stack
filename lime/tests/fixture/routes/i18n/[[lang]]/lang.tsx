// Copyright 2023 the cool authors. All rights reserved. MIT license.

interface LangProps {
  params: Record<string, string | Array<string>>;
}

export default function Lang(props: LangProps) {
  return props.params["lang"]
    ? <div>Hello {props.params["lang"]}</div>
    : <div>Hello</div>;
}
