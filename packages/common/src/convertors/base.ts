import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';


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
    AsyncGenerator<LocalizedConceptWithID, void, undefined>;

  parseLinks?: (
    text: string,
    opts: {
      /**
       * Given a list of IDs, returns a list of concept data objects.
       * If some ID does not have a concept associated, that item will be null.
       */
      getConcepts:
        <T extends readonly string[]>
        (ids: [...T]) => { [K in keyof T]: LocalizedConceptData | null },

      /**
       * If links are to be recognized, appropraite URN namespace is required.
       * This option should contain the entire URN prefix with trailing colon.
       */
      linkURNPrefix?: string;
    },
  ) => string;

  // Can’t use TransformStream due to Node/web typing clash,
  // and we want to use convertors from CLI and Web,
  // hence API is limited to async generator
  //parseInput: TransformStream<Input, IntermediateItem>;
  //readConcepts: TransformStream<IntermediateItem, LocalizedConceptData>;
}


export type LocalizedConceptWithID = [string, LocalizedConceptData];


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


interface CommonStreamProcessingOptions {
  onProgress?: ProgressHandler;
}


interface ProgressHandler {
  (stage: string): void;
}
