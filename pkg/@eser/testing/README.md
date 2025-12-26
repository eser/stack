# 🧪 [@eser/testing](./)

Testing utilities for mocking HTTP servers, filesystems, and managing temporary
directories.

## Features

- **FakeServer**: Mock HTTP server for testing handlers without network I/O
- **FakeFs**: In-memory filesystem for testing file operations
- **TempDir**: Temporary directories with automatic cleanup (AsyncDisposable)

## Quick Start

### Mock HTTP Server

```typescript
import { fakeServer } from "@eser/testing";

const server = new fakeServer.FakeServer((req) => {
  if (req.url.endsWith("/api/users")) {
    return Response.json([{ id: 1, name: "Test" }]);
  }
  return new Response("Not Found", { status: 404 });
});

const response = await server.get("/api/users");
const users = await response.json();
```

### Mock Filesystem

```typescript
import { fakeFs } from "@eser/testing";

const fs = fakeFs.createFakeFs({
  "/app/config.json": '{"port": 3000}',
  "/app/src/main.ts": 'console.log("hello")',
});

const config = await fs.readTextFile("/app/config.json");
// '{"port": 3000}'

for await (const entry of fs.walk("/app/src")) {
  console.log(entry.path);
}
```

### Temporary Directory

```typescript
import { tempDir } from "@eser/testing";
import { runtime } from "@eser/standards/runtime";

// Automatic cleanup with await using
await using temp = await tempDir.withTmpDir();
await runtime.fs.writeTextFile(`${temp.dir}/test.txt`, "hello");
// Directory is automatically cleaned up when scope exits
```

## API Reference

### FakeServer

| Method                       | Description                      |
| ---------------------------- | -------------------------------- |
| `fetch(input, init)`         | Make a request with full control |
| `get(path, headers)`         | Make a GET request               |
| `post(path, body, headers)`  | Make a POST request              |
| `put(path, body, headers)`   | Make a PUT request               |
| `patch(path, body, headers)` | Make a PATCH request             |
| `delete(path, headers)`      | Make a DELETE request            |
| `head(path, headers)`        | Make a HEAD request              |
| `options(path, headers)`     | Make an OPTIONS request          |

### FakeFs

| Method               | Description                  |
| -------------------- | ---------------------------- |
| `readTextFile(path)` | Read file as text            |
| `readFile(path)`     | Read file as bytes           |
| `walk(root)`         | Iterate over files           |
| `isDirectory(path)`  | Check if path is a directory |
| `exists(path)`       | Check if path exists         |

### TempDir Utilities

| Function              | Description                             |
| --------------------- | --------------------------------------- |
| `withTmpDir(options)` | Create temp directory with auto-cleanup |
| `delay(ms)`           | Delay execution                         |
| `writeFiles(files)`   | Write multiple files at once            |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
