# Migration adapters for Glossarist adopters

Please file an issue if you are looking for help implementing
a migration adapter for your pre-existing terminology data.

## Development

### Pre-requisites

Either Docker or NodeJS 18 with Yarn 2.

### Setting up LSP in your editor

Without having Node or anything on your computer,
can run an LSP server using this simple Dockerfile:

```dockerfile
FROM node:18.16.1
ARG project_path
WORKDIR ${project_path:?}
RUN corepack enable
RUN corepack prepare yarn@stable --activate
CMD ["yarn", "run", "typescript-language-server", "--stdio"]
```

Which you can build and run with these commands
executed in repository root:

```
docker build --build-arg "project_path=$(pwd)" -t "<your label>" .
docker container run --interactive --rm --network=none --workdir="$(pwd)" --volume="$(pwd):$(pwd):ro" "<your label>"
```

### Making TS see changes across packages

Say you’re working on two packages in this repo, and need package A
to see changes in package B without publishing anything on NPM.
Run the `compile` command against package B’s workspace.

### Working with Yarn monorepo

Running a command against a subpackage works like this:

```console
.../migration-adapters$ yarn workspace @riboseinc/glossarist-x3duom compile
```

TODO: This example assumes NodeJS is installed on your machine.
It’s probably possible to do this using the same container as above.

### Release flow

TBD.
