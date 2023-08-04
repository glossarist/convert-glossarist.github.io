import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { Designation } from '@riboseinc/paneron-extension-glossarist/models/concepts.js';


/** Takes some sort of input data and provides localized concepts. */
export interface Convertor<
  /** An item of user-provided input data, e.g. a file or an URL. */
  InputItem extends unknown,

  // TODO: Find a better data structure / type to represent an object?
  IntermediateItem extends Record<string, any>,
> {
  /** Very short descriptive designation for this convertor. */
  label: string;

  /** User-friendly description of what to provide. */
  inputDescription: string;

  /** Deserializes given files into suitable intermediate structures. */
  parseInput: (
    input: () => AsyncGenerator<InputItem, void, undefined>,
    opts?: CommonStreamProcessingOptions,
  ) =>
    AsyncGenerator<IntermediateItem, void, undefined>;

  /**
   * Parses intermediate structures into pairs of [identifier, concept].
   *
   * The identifier may be used for internal links.
   */
  readConcepts: (
    input: () => AsyncGenerator<IntermediateItem, void, undefined>,
    opts?: CommonStreamProcessingOptions,
  ) =>
    AsyncGenerator<LocalizedConceptData, void, undefined>;

  parseLinks?: LinkParser;

  // Can’t use TransformStream due to Node/web typing clash,
  // and we want to use convertors from CLI and Web,
  // hence API is limited to async generator
  //parseInput: TransformStream<Input, IntermediateItem>;
  //readConcepts: TransformStream<IntermediateItem, LocalizedConceptData>;
}


export interface LinkParser {
  (
    text: string,
    getLinkText: {
      forMatchingDesignation: (predicate: (c: Designation) => boolean) =>
        string | undefined,
      forConceptID: (id: string) =>
        string | undefined,
    }
  ): string;
}


//export type LocalizedConceptWithID = [string, LocalizedConceptData];


/**
 * Workaround for incompatible file typings between Node and web.
 * Associates a typed array with (relative) file path.
 */
export interface File {
  blob: Uint8Array;
  name: string;
}


/**
 * A convertor that handles files or folders,
 * either uploaded via a Web GUI or supplied via command-line.
 */
export interface FileConvertor<
  Item extends Record<string, any>,
>
extends Convertor<File, Item> {}


export interface CommonStreamProcessingOptions {
  onProgress?: ProgressHandler;
}


interface ProgressHandler {
  (stage: string): void;
}
