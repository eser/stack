// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { view } from "../../../runtime.ts";

export default function IslandWithProps(
  props: { foo: { bar: string } },
) {
  const [showText, setShowText] = view.adapter.useState(false)!;

  view.adapter.useEffect(() => {
    setShowText(true);
  }, []);

  return (
    <div className="island">
      <p>
        {showText ? props.foo.bar : "it doesn't work"}
      </p>
    </div>
  );
}
