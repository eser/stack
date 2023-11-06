// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type Signal } from "@preact/signals-react";

export default function Spinner(props: { id: string; show: Signal<boolean> }) {
  return props.show.value
    ? <p className={`spinner spinner-${props.id}`}>loading...</p>
    : null;
}
