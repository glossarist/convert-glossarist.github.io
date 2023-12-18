import fs from 'node:fs/promises';
import path from 'node:path';
import type { File, } from 'common';


/**
 * Converts an absolute path to a generator of `File` objects.
 */
export async function * fsPathToFiles(absPath: string) {
  for (const filepath of await fs.readdir(absPath)) {
    const file: File = {
      blob: Uint8Array.from(await fs.readFile(filepath)),
      name: path.basename(filepath),
      fullPath: filepath,
    };
    yield file;
  }
}
