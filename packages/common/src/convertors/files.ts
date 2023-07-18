import type { Convertor } from '.';


/** User input uploaded via Web GUI. */
export type UploadedUserInput = FileSystemFileEntry | FileSystemDirectoryEntry;


/**
 * A convertor that handles files or folders,
 * either uploaded via a Web GUI or supplied via command-line.
 */
export interface FileConvertor<Item extends Record<string, any>>
extends Convertor<File, Item> {}


/** Returns files from given directory (only topmost level though, no recursion). */
function getFiles(reader: FileSystemDirectoryReader): Promise<FileSystemFileEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries((results) => {
      resolve(results.filter(r => r.isFile).map(r => r as FileSystemFileEntry));
    }, reject);
  });
}


export async function * generateFileEntriesFromDirectory(dir: FileSystemDirectoryEntry):
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


// function fileEntryToArrayBuffer(fileEntry: FileSystemFileEntry): Promise<ArrayBuffer> {
//   return new Promise((resolve, reject) =>
//     fileEntry.file(file => resolve(file.arrayBuffer()), reject)
//   );
// }
// 
// 
// function fileEntryToFile(fileEntry: FileSystemFileEntry): Promise<File> {
//   return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
// }
// 
// async function * userInputToFiles (input: UploadedUserInput) {
//   const fileEntries = input.isDirectory
//     ? generateFileEntriesFromDirectory(input as FileSystemDirectoryEntry)
//     : [input as FileSystemFileEntry];
//   for await (const fileEntry of fileEntries) {
//     yield fileEntryToFile(fileEntry);
//   }
// }
