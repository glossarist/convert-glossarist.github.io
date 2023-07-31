import { join, resolve, extname } from 'node:path';
import { copyFile, readFile, mkdir, watch, access, constants } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parse as parseURL, fileURLToPath } from 'node:url'
import { createServer } from 'node:http';
import { build as esbuild, type LogLevel as ESBuildLogLevel } from 'esbuild';


type LogLevel = Extract<ESBuildLogLevel, 'debug' | 'info' | 'error' | 'silent'>;

interface BuildOptions {

  /** Serve-ready web version, built and bundled. */
  distdir: string;

  /** TS sources. */
  srcdir: string;

  /** Public web assets. */
  pubdir: string;

  logLevel: LogLevel;
}

const noop = (..._: any[]) => void 0;


/** Main routine for building everything. */
async function build({ distdir, pubdir, srcdir, logLevel }: BuildOptions) {
  if (logLevel === 'debug') {
    console.debug("building all...");
  }
  return await Promise.all([
    copyAssets(distdir, pubdir),
    buildJS(distdir, srcdir, logLevel),
  ]);
}


async function copyAssets(distdir: string, pubdir: string) {
  await copyFile(
    join(pubdir, 'index.html'),
    join(distdir, 'index.html'),
  );
}


async function buildJS(distdir: string, srcdir: string, logLevel: LogLevel) {
  return await esbuild({
    entryPoints: [
      join(srcdir, 'index.tsx'),
    ],
    entryNames: '[dir]/[name]',
    assetNames: '[dir]/[name]',
    format: 'esm',
    target: ['esnext'],
    bundle: true,
    //external: ['react', 'react-dom'],
    minify: false,
    sourcemap: false,
    //publicPath: 'https://convertor.glossarist.org/',
    outdir: distdir,
    write: true,
    loader: {
      '.css': 'local-css',
      // '.jpg': 'file',
      // '.png': 'file',
    },
    logLevel,
    plugins: [],
  });
}


// Run as CLI?
// ===========

const pathToThisFile = resolve(fileURLToPath(import.meta.url));
const pathPassedToNode = process.argv[1]
  ? resolve(process.argv[1])
  : undefined;
const cliMode = pathPassedToNode
  ? pathToThisFile.includes(pathPassedToNode)
  : undefined;
if (cliMode) {
  await main();
}


/** Entry point when invoked as CLI script. */
async function main() {

  const { values } = parseArgs({
    options: {
      serve: { type: 'boolean' },
      port: { type: 'string' },
      debug: { type: 'boolean' },
      verbose: { type: 'boolean' },
    },
  });

  const buildOpts: BuildOptions = {
    distdir: join('.', 'dist'),
    srcdir: join('.', 'src'),
    pubdir: join('.', 'public'),
    logLevel:
      values.debug
        ? 'debug'
        : values.verbose
            ? 'info'
            : 'error',
  };

  // Monkey-patch console into desired log level :/
  if (!values.debug) {
    console.debug = noop;
    if (!values.verbose) {
      console.log = noop;
      // info is considered higher level than log, and will be output
    }
  }

  const _build = makeSequential(async function buildCLI() {
    return await build(buildOpts);
  });

  await mkdir(buildOpts.distdir, { recursive: true });

  await Promise.all([
    access(buildOpts.distdir, constants.W_OK),
    access(buildOpts.srcdir, constants.R_OK),
    access(buildOpts.pubdir, constants.R_OK),
  ]);

  if (values.serve) {
    const port = parseInt(values.port ?? '8080', 10);
    const ac = new AbortController();
    function abortServe() { ac.abort(); }
    process.on('SIGINT', abortServe);
    try {
      await _build();
      await serve(
        buildOpts.distdir,
        port,
        ac.signal);
      await watchAndCall(
        [buildOpts.srcdir, buildOpts.pubdir],
        _build,
        ac.signal);
    } catch (e) {
      abortServe();
      throw e;
    }
  } else {
    if (values.port) {
      throw new Error("--port requires --serve");
    }
    await _build();
  }
}


async function serve(
  root: string,
  port: number,
  signal: AbortSignal,
) {
  console.log(`serve: starting server at port ${port}...`);

  const ctypes = new Map([
    ['.html', 'text/html'],
    ['.js', 'text/javascript'],
    ['.json', 'application/json'],
    ['.jsonld', 'application/ld+json'],
  ]);

  const server = createServer(async function handleRequest(req, resp) {
    if (!req.url) { return; }
    const requestedPath = parseURL(req.url).pathname ?? '/';
    const filename = !requestedPath || requestedPath.endsWith('/')
      ? 'index.html'
      : requestedPath;
    const ctype = ctypes.get(extname(filename)) ?? 'application/octet-stream';
    console.info(`serve: serving ${filename} as ${ctype}...`);
    try {
      const blob = await readFile(join(root, filename));
      resp.writeHead(200, {'Content-Type': ctype});
      resp.write(blob, 'binary');
      resp.end();
    } catch (e) {
      console.error("Failed to handle response", req.url, e);
      resp.writeHead(500);
      resp.end();
    }
  });

  signal.addEventListener('abort', function abortServe() {
    console.debug("serve: stopping server...");
    server.closeAllConnections?.();
    return new Promise((resolve, reject) =>
      server.close((err) => err ? reject(err) : resolve(void 0)));
  });

  server.setTimeout(500);
  server.listen(port);

  console.info(`serve: listening at port ${port}`);
}


async function watchAndCall(
  /** Subdirectories, relative to current path, to watch recursively. */
  subdirs: string[],

  /** Function to execute on changes. */
  cb: () => void,

  signal: AbortSignal,
) {
  let debounceTimeout: NodeJS.Timeout | number | null = null;

  function cancel() {
    if (debounceTimeout) {
      console.debug("watch: cancelling scheduled callback");
      clearTimeout(debounceTimeout);
    }
  }

  // Subdirectories to watch as fully-qualified paths
  const fqdirs = subdirs.map(d => resolve(d));

  const watcher = watch('.', { recursive: true, signal });
  try {
    for await (const evt of watcher) {
      const fqfn = evt.filename ? resolve(evt.filename) : undefined;
      if (fqfn && fqdirs.find(fqd => fqfn.startsWith(fqd))) {
        console.log(`watch: file changed: ${evt.filename}`);
        cancel();
        debounceTimeout = setTimeout(cb, 1000);
      } else if (evt.filename) {
        console.debug(`watch: ignoring file change: ${evt.filename}`);
      }
    }
  } catch (e) {
    if ((e as any).name === 'AbortError') {
      console.debug("watch: stopping watcher...");
      cancel();
      return;
    }
    throw e;
  }

  cancel();
}


/** A helper to avoid given async function executing in parallel. */
function makeSequential
<T, A extends unknown[]>
(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let workQueue: Promise<void> = Promise.resolve();
  return (...args) => {
    function sequential() { return fn(...args); };
    const result = workQueue.then(sequential, sequential);
    workQueue = result.then(noop, noop);
    return result;
  };
}
