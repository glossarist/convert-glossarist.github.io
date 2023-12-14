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
      (await new Promise((resolve, reject) =>
        fileEntry.file(resolve, reject))),
      fileEntry.fullPath || fileEntry.name);
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

  /** How many levels to recurse. Currently ignored, recurses infinitely. */
  depth: number = 1,
): Promise<FileSystemFileEntry[]> {
  if (depth !== 1) {
    throw new Error("No depth except 1 is supported at this time.");
  }
  return new Promise((resolve, reject) => {
    reader.readEntries((results) => {
      const directoryReads = results.
        filter(r => r.isDirectory).
        map(r => getFiles((r as FileSystemDirectoryEntry).createReader()));
      Promise.all(directoryReads).then(directoryReadResults => {
        resolve([
          ...directoryReadResults.flat(),
          ...results.filter(r => r.isFile).map(r => r as FileSystemFileEntry),
        ]);
      }, reject);
    }, reject);
  });
}


async function createFile(file: File, fullPath: string): Promise<_File> {
  return {
    blob: new Uint8Array(await file.arrayBuffer()),
    name: file.name,
    fullPath,
  };
}
