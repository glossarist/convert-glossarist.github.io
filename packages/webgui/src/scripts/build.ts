import { join, resolve } from 'node:path';
import { copyFile, readFile, mkdir, watch } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parse as parseURL, fileURLToPath } from 'node:url'
import { createServer } from 'node:http';
import { build as esbuild } from 'esbuild';
import CssModulesPlugin from 'esbuild-css-modules-plugin';


/** Public web assets. */
const PUBLIC_DIR = join('.', 'public');

/** Serve-ready web version. */
const DIST_DIR = join('.', 'dist');

/** TS source. */
const SRC_DIR = join('.', 'src');


// Run as CLI
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


async function buildHTML() {
  await mkdir(DIST_DIR, { recursive: true });
  copyFile(
    join(PUBLIC_DIR, 'index.html'),
    join(DIST_DIR, 'index.html'),
  );
}


function buildJS() {
  return esbuild({
    entryPoints: [
      join(SRC_DIR, 'index.tsx'),
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
    outdir: DIST_DIR,
    write: true,
    loader: {
      // '.jpg': 'file',
      // '.png': 'file',
    },
    logLevel: 'debug',
    plugins: [
      CssModulesPlugin(),
    ],
  });
}


async function build() {
  return await Promise.all([buildHTML(), buildJS()]);
}


async function serveAndRebuild(port: number, signal: AbortSignal) {
  console.log(`Starting server at ${port}...`);

  const buildPromise = build();

  const server = createServer(async function handleRequest(req, resp) {
    if (!req.url) { return; }
    const requestedPath = parseURL(req.url).pathname ?? '/';
    const filename = !requestedPath || requestedPath.endsWith('/')
      ? 'index.html'
      : requestedPath;
    console.log(`Serving ${filename}...`);
    try {
      const blob = await readFile(join(DIST_DIR, filename));
      resp.writeHead(200);
      resp.write(blob, 'binary');
      resp.end();
    } catch (e) {
      console.error("Failed to handle response", req.url, e);
      resp.writeHead(500);
      resp.end();
    }
  });

  server.setTimeout(500);
  server.listen(port);

  console.log(`Listening at ${port}`);

  await buildPromise;
  watchAndRebuild(signal);

  signal.addEventListener('abort', function abortServe() {
    console.log(`Stopping serve...`);
    server.closeAllConnections?.();
    return new Promise((resolve, reject) =>
      server.close((err) => err ? reject(err) : resolve(void 0)));
  });
}


async function watchAndRebuild(signal: AbortSignal) {
  const watcher = watch('.', { recursive: true, signal });

  let debounceTimeout: NodeJS.Timeout | null = null;

  function scheduleRebuild() {
    cleanup();
    debounceTimeout = setTimeout(build, 1000);
  }

  function cleanup() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
  }

  try {
    for await (const evt of watcher) {
      if (evt.filename && !resolve(evt.filename).startsWith(resolve(DIST_DIR))) {
        console.log(`Source changed: ${evt.filename}`);
        scheduleRebuild();
      } else if (evt.filename) {
        console.log(`Ignoring file change: ${evt.filename}`);
      }
    }
  } catch (e) {
    if ((e as any).name === 'AbortError') {
      console.log("Stopping watcher...");
      cleanup();
      return;
    }
    throw e;
  }

  cleanup();
}


async function main() {
  const { values } = parseArgs({
    options: {
      serve: { type: 'boolean' },
      port: { type: 'string' },
    },
  });

  if (values.serve) {
    const port = parseInt(values.port ?? '8080', 10);
    const ac = new AbortController();
    process.on('SIGINT', function handleSIGINT() { ac.abort() });
    try {
      await serveAndRebuild(port, ac.signal);
    } catch (e) {
      ac.abort();
    }
  } else {
    if (values.port) {
      throw new Error("--port requires --serve");
    }
    await build();
  }
}
