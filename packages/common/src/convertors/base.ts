import type { RegisterItem, RegisterConfiguration, ItemClassConfiguration } from '@riboseinc/paneron-registry-kit/types';


/** Takes some sort of input data and provides localized concepts. */
export interface Convertor<
  /** An item of user-provided input data, e.g. a file or an URL. */
  InputItem extends unknown,

  // TODO: Find a better data structure / type to represent an object?
  IntermediateItem extends Record<string, any>,

  OutputItem extends Record<string, any>,

  RegisterConfig extends RegisterConfiguration | null,
> {
  /** Very short descriptive designation for this convertor. */
  label: string;

  /** User-friendly description of what to provide. */
  inputDescription: string;

  /** Deserializes given input data into suitable intermediate structures. */
  parseInput: (
    input: () => AsyncGenerator<InputItem, void, undefined>,
    opts?: CommonStreamProcessingOptions,
  ) =>
    AsyncGenerator<IntermediateItem, void, undefined>;

  /**
   * Converts a stream of intermediate structures into a stream of output items.
   */
  generateItems:
    (
      input: () => AsyncGenerator<IntermediateItem, void, undefined>,
      opts?: CommonStreamProcessingOptions,
    ) =>
      AsyncGenerator<OutputItem, void, undefined>;

  /**
   * Converts a stream of output items into a stream of register items.
   */
  generateRegisterItems:
    RegisterConfig extends RegisterConfiguration
      ? (
          items: AsyncGenerator<OutputItem, void, undefined>,
          opts?: RegisterItemConversionOpts,
        ) => AsyncGenerator<RegisterItemsByClassID<RegisterConfig>, void, undefined>
      : never;

  // Can’t use TransformStream due to Node/web typing clash,
  // and we want to use convertors from CLI and Web,
  // hence API is limited to async generator
  //parseInput: TransformStream<Input, IntermediateItem>;
  //readConcepts: TransformStream<IntermediateItem, LocalizedConceptData>;
}


type GetRegisterItemPayloadType<T> =
  T extends ItemClassConfiguration<infer K> ? K : never;

export type RegisterItemsByClassID<
  P extends RegisterConfiguration,
> = {
  [K in keyof P["itemClassConfiguration"]]?:
    RegisterItem<GetRegisterItemPayloadType<P["itemClassConfiguration"][K]>>
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
  IntermediateItem extends Record<string, any>,
  OutputItem extends Record<string,any>,
  RegisterConfig extends RegisterConfiguration | null>
extends Convertor<
  File,
  IntermediateItem,
  OutputItem,
  RegisterConfig> {}


export interface CommonStreamProcessingOptions {
  onProgress?: ProgressHandler;
}


export interface RegisterItemConversionOpts extends CommonStreamProcessingOptions {
  /** URN namespace of the standard, may be required by some registers. */
  urnNamespace?: string;

  // /** Returns a human-readable `identifier` for universal concept data. */
  // conceptIDMaker?: (
  //   /** Zero-based index for current item in a stream. */
  //   idx: number,
  //   /** Concept entry. */
  //   conceptData: LocalizedConceptData,
  // ) => string,
}


interface ProgressHandler {
  (stage: string): void;
}
