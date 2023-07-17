import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData';


export interface ItemConvertor<Item extends unknown> {
  (item: Item): Promise<LocalizedConceptData>;
}


export interface InputDecoder<Item extends unknown> {
  (input: UserInput): AsyncGenerator<Item>;
}

export type UserInput = FileSystemFileEntry | FileSystemDirectoryEntry;


export interface ConvertFile<Item extends unknown> {
  (
    input: UserInput,
    decodeInput: InputDecoder<Item>,
    itemConvertor: ItemConvertor<Item>,
  ): AsyncGenerator<LocalizedConceptData, void, void>;
}


export interface Convertor<Item extends unknown> {
  label: string;
  description: string;
  decodeInput: InputDecoder<Item>;
  convertItem: ItemConvertor<Item>;
}
