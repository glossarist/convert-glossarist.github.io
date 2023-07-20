import type { File as _File } from 'common';


/** User input uploaded via Web GUI. */
type UploadedUserInput = FileSystemFileEntry | FileSystemDirectoryEntry;


/**
 * Converts a result of an uploiad to a generator of `File` objects.
 * Ignores nested directories.
 */
export async function * parseFilesFromUpload(input: UploadedUserInput) {
  const fileEntries = input.isDirectory
    ? generateFileEntriesFromDirectory(input as FileSystemDirectoryEntry)
    : [input as FileSystemFileEntry];
  for await (const fileEntry of fileEntries) {
    yield await createFile(
      await new Promise((resolve, reject) =>
        fileEntry.file(resolve, reject)));
  }
}


async function * generateFileEntriesFromDirectory(dir: FileSystemDirectoryEntry):
AsyncGenerator<FileSystemFileEntry, void, undefined> {
  const reader = dir.createReader();
  while (true) {
    const results = await getFiles(reader);
    if (results.length > 0) {
      yield * results;
    } else {
      break;
    }
  }
}


/**
 * Returns a list of file entries, given a directory reader.
 */
function getFiles(
  reader: FileSystemDirectoryReader,

  /** How many levels to recurse. Currently limited to 1. */
  depth: number = 1,
): Promise<FileSystemFileEntry[]> {
  if (depth !== 1) {
    throw new Error("No depth except 1 is supported at this time.");
  }
  return new Promise((resolve, reject) => {
    reader.readEntries((results) => {
      resolve(results.filter(r => r.isFile).map(r => r as FileSystemFileEntry));
    }, reject);
  });
}


async function createFile(file: File): Promise<_File> {
  return {
    blob: new Uint8Array(await file.arrayBuffer()),
    name: file.name,
  };
}
