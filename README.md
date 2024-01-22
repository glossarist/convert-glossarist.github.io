# Converter collection

[![compile_all](https://github.com/paneron/convertors/actions/workflows/compile.yml/badge.svg)](https://github.com/paneron/convertors/actions/workflows/compile.yml)

Feel free to file an issue if you are looking for help implementing
a migration adapter for your pre-existing terminology data.

### [convert.paneron.org](https://convert.paneron.org)

[![build_deploy](https://github.com/paneron/convert.paneron.org/actions/workflows/build_deploy.yml/badge.svg)](https://github.com/paneron/convert.paneron.org/actions/workflows/build_deploy.yml)

## Development

NOTE: This started to aid in migration to Glossarist,
but being expanded to cover other data models.
The repository may soon be renamed and moved to a more appropriate place.

This is a TypeScript monorepo.

The packages include:

- Core logic for converting from different formats to Glossarist
- Common interfaces and tools
- Web GUI and in future CLI for invoking those adapters/convertors

Right now, packages are not published separately.
Some packages may be published separately in future,
while other packages (e.g., webgui or cli)
may only be deployed or distributed.

### Pre-requisites

Below instructions will expect you to either use
NodeJS 18.18
(there is an incompatibility with newer Node versions)
with Yarn on your host machine
(no-Docker approach is labeled “host” below)
or to have Docker (e.g., as Docker Desktop).

TODO: ways to invoke through Docker are a bit long,
perhaps there could be a Makefile or something.

#### Preparing a Docker image

Project includes a simple `tsls.Dockerfile`,
by default it runs TypeScript language server
but the command can be overridden (see examples below).

Build it like this, executed in repository root:

```
docker build -f tsls.Dockerfile --build-arg "project_path=$(pwd)" -t "<your-image-label>" .
```

### Configuring LSP in your editor

Host: hopefully your IDE will understand how it works?

Docker: configure your editor to run the container.
This will mount project root in read-only mode at the same path,
so that LSP hints work seamlessly:

```
docker container run --interactive --rm --network=none \
   --workdir="$(pwd)" \
   --volume="$(pwd):$(pwd):ro" \
   "<your-image-label>"
```

### Building Web GUI

These examples supply `--debug` flag, but you can remove it
to suppress unnecessary logging
if build process is sufficiently stable.

Host: `yarn workspace webgui build --debug`

Docker:

```
docker container run --interactive --network=none \
   --workdir="$(pwd)" \
   --volume="$(pwd):$(pwd):ro" \
   --volume="$(pwd)/webgui-dist:/tmp/dist" \
   "<your-image-label>" \
   yarn workspace webgui build --distdir "/tmp/dist" --debug
```

This will output Web GUI files, ready to serve,
in `webgui-dist` directory under repository root.

### Serving Web GUI locally

Same as above, but add `--serve` flag in addition to `--debug`.
It will be served at `localhost:8080`.

#### Watching while serving

This should be run from repo root, not from webgui package:

```
yarn workspace webgui build --serve --watch $(pwd)/packages/gr-sheet/src
```

TODO: complete this section.

### Compiling all

Host: to compile all packages, run `yarn compile-all`;
to compile a single package, run `yarn workspace <package> compile`
(it may fail if local dependencies were not compiled).

Docker: to compile all, run:

```
docker container run --interactive --network=none \
   --workdir="$(pwd)" \
   --volume="$(pwd):$(pwd)" \
   "<your-image-label>" \
   yarn compile-all
```

NOTE: This command mounts the volume in **read-write** mode,
because the way scripts work currently requires `tsc` to be able
to write to each package’s `compiled` directory.
Entry points in each `package.json` are specified as `compiled/...`.


### Making TS see changes across packages

Say you’re working on two packages in this repo, and need package A
to see changes in package B without publishing anything on NPM.
Run the `compile` command against package B’s workspace,
or just compile all packages.

### Working with Yarn monorepo

Running a command against a subpackage works like this:

```console
.../migration-adapters$ yarn workspace @riboseinc/glossarist-x3duom compile
```

This also applies to commands like `yarn add`, `yarn remove`, etc.

TODO: This example assumes NodeJS is installed on your machine.
It’s probably possible to do this using the same container as above.

#### Creating a new package

1. Create corresponding directory under `packages/`.
2. Create a `tsconfig.json`, using an existing package as an example.

   - You will almost certainly extent the repo-wide `tsconfig.json`.
   - You need to provide the `include` option.
   - You will often find it necessary to override `compilerOptions.lib`.

3. Create a `package.json`, using an existing package as an example.

   - If you publish the package,
     its `name` would have to follow `<org namespace>/package-name`.
     This full name will become the workspace idnetifier you specify when executing
     `yarn workspace <workspace ID> <some command>`.

   - Otherwise you can use any short name.

#### Building for distribution

TBD.

### Release flow

TBD.
