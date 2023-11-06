// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { useSignal } from "@preact/signals-react";
import { useEffect } from "react";

export default function LazyLink(props: { links: Array<string> }) {
  const sig = useSignal(false);

  useEffect(() => {
    sig.value = true;
  }, []);

  return (
    <div className="island">
      {sig.value
        ? (
          <ul className="revived">
            {props.links.map((link) => {
              return (
                <li key={link}>
                  <a href={link}>{link}</a>
                </li>
              );
            })}
          </ul>
        )
        : null}
    </div>
  );
}
