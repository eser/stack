// Copyright 2023 the cool authors. All rights reserved. MIT license.

// islands/Dropdown.tsx
import {
  type ComponentChildren,
  createContext,
  type StateUpdater,
  useState,
} from "react";

const DropdownContext = createContext<[boolean, StateUpdater<boolean>]>(
  [false, () => {}],
);

export default function Dropdown(
  { children }: { children: ComponentChildren },
) {
  return (
    <DropdownContext.Provider value={useState(false)}>
      {children}
    </DropdownContext.Provider>
  );
}

export function DropdownHandle(
  { children }: { children: ComponentChildren },
) {
  return (
    <DropdownContext.Consumer>
      {([isMenuOpen, setIsMenuOpen]) => {
        return (
          <button
            onClick={() => {
              setIsMenuOpen(!isMenuOpen);
            }}
          >
            {children}
          </button>
        );
      }}
    </DropdownContext.Consumer>
  );
}

export function DropdownMenu({ children }: { children: ComponentChildren }) {
  return (
    <DropdownContext.Consumer>
      {([isMenuOpen]) => {
        if (isMenuOpen) {
          return children;
        }
        return null;
      }}
    </DropdownContext.Consumer>
  );
}
