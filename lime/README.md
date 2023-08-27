[Documentation](#-documentation) | [Getting started](#-getting-started) |
[API Reference](https://deno.land/x/coollime?doc)

# cool lime

<img align="right" src="https://coollime.deno.dev/logo.svg" height="150px" alt="The cool lime logo: a sliced lime dripping with juice">

**cool lime** is a next generation web framework, built for speed, reliability,
and simplicity.

it's built on top of [Deno](https://deno.land/) and it's
[Fresh](https://fresh.deno.dev/) framework.

Some stand-out features:

- Just-in-time rendering on the edge.
- Island based client hydration for maximum interactivity.
- Zero runtime overhead: no JS is shipped to the client by default.
- No build step.
- No configuration necessary.
- TypeScript support out of the box.
- File-system routing à la Next.js.

## 📖 Documentation

The [documentation](https://coollime.deno.dev/docs/) is available on
[coollime.deno.dev](https://coollime.deno.dev/).

## 🚀 Getting started

Install [Deno CLI](https://deno.land/) version 1.35.0 or higher.

You can scaffold a new project by running the cool lime init script. To scaffold
a project run the following:

```sh
deno run -A -r https://coollime.deno.dev
```

Then navigate to the newly created project folder:

```
cd lime-demo
```

From within your project folder, start the development server using the
`deno task` command:

```
deno task start
```

Now open http://localhost:8000 in your browser to view the page. You make
changes to the project source code and see them reflected in your browser.

To deploy the project to the live internet, you can use
[Deno Deploy](https://deno.com/deploy):

1. Push your project to GitHub.
2. [Create a Deno Deploy project](https://dash.deno.com/new).
3. [Link](https://deno.com/deploy/docs/projects#enabling) the Deno Deploy
   project to the **`main.ts`** file in the root of the created repository.
4. The project will be deployed to a public $project.deno.dev subdomain.

For a more in-depth getting started guide, visit the
[Getting Started](https://coollime.deno.dev/docs/getting-started) page in the
cool lime docs.

## Contributing

We appreciate your help! To contribute, please read our
[contributing instructions](https://coollime.deno.dev/docs/contributing).

## Adding your project to the showcase

If you feel that your project would be helpful to other cool lime users, please
consider putting your project on the
[showcase](https://coollime.deno.dev/showcase). However, websites that are just
for promotional purposes may not be listed.

To take a screenshot, run the following command.

```sh
deno task screenshot [url] [your-app-name]
```

Then add your site to
[showcase.json](https://github.com/eser/coollime/blob/main/www/data/showcase.json),
preferably with source code on GitHub, but not required.

## Badges

![Made with cool lime](./www/static/lime-badge.svg)

```md
[![Made with cool lime](https://coollime.deno.dev/lime-badge.svg)](https://coollime.deno.dev)
```

```html
<a href="https://coollime.deno.dev">
  <img
    width="197"
    height="37"
    src="https://coollime.deno.dev/lime-badge.svg"
    alt="Made with cool lime"
  />
</a>
```

![Made with cool lime(dark)](./www/static/lime-badge-dark.svg)

```md
[![Made with cool lime](https://coollime.deno.dev/lime-badge-dark.svg)](https://coollime.deno.dev)
```

```html
<a href="https://coollime.deno.dev">
  <img
    width="197"
    height="37"
    src="https://coollime.deno.dev/lime-badge-dark.svg"
    alt="Made with cool lime"
  />
</a>
```
