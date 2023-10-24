import { Fader } from "./Fader.tsx";
import { Logger } from "./Logger.tsx";
import { type ComponentChildren } from "react";

export default function PassThrough(props: { children?: ComponentChildren }) {
  return (
    <Fader>
      <Logger name="PassThrough">
        <div className="island">
          {props.children}
        </div>
      </Logger>
    </Fader>
  );
}
