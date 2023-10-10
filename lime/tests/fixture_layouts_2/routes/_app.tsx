import { defineApp } from "../../../server.ts";

export default defineApp((_req, { Component }) => {
  return (
    <div className="app">
      <Component />
    </div>
  );
});
