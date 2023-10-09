import { defineApp } from "$cool/lime/server.ts";

export default defineApp((req, { Component }) => {
  return (
    <div className="app">
      <Component />
    </div>
  );
});
