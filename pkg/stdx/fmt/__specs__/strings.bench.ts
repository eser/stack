import { trimEnd, trimStart } from "../strings.ts";

const groupTrimStart = "trimStart";

Deno.bench("hex/stdx/fmt/trimStart", {
  group: groupTrimStart,
  baseline: true,
}, () => {
  trimStart("  hello world  ");
});

Deno.bench("regex replace", { group: groupTrimStart }, () => {
  "  hello world  ".replace(/^\s+/, "");
});

Deno.bench("string.prototype.trimStart", { group: groupTrimStart }, () => {
  "  hello world  ".trimStart();
});

const groupTrimEnd = "trimEnd";

Deno.bench("hex/stdx/fmt/trimEnd", {
  group: groupTrimEnd,
  baseline: true,
}, () => {
  trimEnd("  hello world  ");
});

Deno.bench("regex replace", { group: groupTrimEnd }, () => {
  "  hello world  ".replace(/\s+$/, "");
});

Deno.bench("string.prototype.trimEnd", { group: groupTrimEnd }, () => {
  "  hello world  ".trimEnd();
});
