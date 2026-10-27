# 🛰️ [laroux](./)

The `laroux` command for [laroux.js](../laroux-server/README.md) apps, published
to npm as the package `laroux`. It runs `laroux init`, `laroux dev`,
`laroux build` and `laroux serve`.

The commands live in [@eserstack/laroux-server](../laroux-server/README.md);
this package holds only the bin and depends on `@eserstack/laroux-server` at its
own version. App code imports the `@eserstack` packages, and the app lists
`laroux` as a dev dependency, so the command and the app share one React and
one copy of laroux-server:

```bash
npm install @eserstack/laroux @eserstack/laroux-react react react-dom
npm install --save-dev laroux
```

The app's scripts call the bin:

```json
{
  "scripts": {
    "dev": "laroux dev",
    "build": "laroux build",
    "serve": "laroux serve"
  }
}
```

## 🔗 Links

- [@eserstack/laroux-server](../laroux-server/README.md): the commands, the dev
  server and the production server
- [@eserstack/laroux](../laroux/README.md): what app code imports
- [eser/stack on GitHub](https://github.com/eser/stack)
