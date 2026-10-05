# Container Images

How this codebase writes Dockerfiles and chooses the images it builds and runs.
Rolling images out is deployments.md.

---

## Debian Slim Base Images

Scope: Every Dockerfile and compose file, and any image a CI job runs in

Rule: Build on Debian, never Alpine. A runtime stage starts from
`debian:<release>-slim` or the slim Debian tag of a language image
(`node:24-trixie-slim`). A build stage may use the full Debian tag
(`golang:1.26-trixie`), since it never ships. A third-party image without a slim
variant uses its default Debian tag (`postgres:17`, not `postgres:17-alpine`).
Name the Debian release in the tag (`trixie-slim`, not `stable-slim` or
`latest`), so moving to the next release is a reviewed change.

Correct:

```dockerfile
FROM node:24-trixie-slim
```

Incorrect:

```dockerfile
FROM node:24-alpine
```

**Why:** Alpine is built on musl instead of glibc. Prebuilt binaries and native
modules made for glibc fail to load there or need their own builds, and musl's
DNS resolver and memory allocator behave differently from glibc's, which shows
up as bugs and slowdowns that appear only in the container. A slim Debian image
is only slightly larger.

---

## Two-Stage Builds When There Is a Build Step

Scope: Images whose contents come out of a build: compiled binaries, bundled
assets, installed dependencies

Rule: When the image needs a build step, split the Dockerfile into a build stage
and a runtime stage. The build stage holds the toolchain, the sources and the
caches; the runtime stage starts from a slim base and copies in only the build
output. Copy the dependency manifests and install before copying the sources. An
image that ships files as they are (a script with no dependencies, static files
for an existing server image) stays a single stage.

Correct:

```dockerfile
FROM golang:1.26-trixie AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM debian:trixie-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/server /usr/local/bin/server
USER nobody
ENTRYPOINT ["/usr/local/bin/server"]
```

Incorrect:

```dockerfile
FROM golang:1.26-trixie
WORKDIR /src
COPY . .
RUN go build -o /usr/local/bin/server ./cmd/server
ENTRYPOINT ["/usr/local/bin/server"]
```

**Why:** the shipped image carries only what runs, so it pulls faster, has fewer
packages to patch and scan, and holds no source code or build-time credentials.
Installing dependencies before copying the sources keeps that layer cached
across code changes.
