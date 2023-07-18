import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData';


/** Takes some sort of input data and provides localized concepts. */
export interface Convertor<
  Input extends unknown,

  // TODO: Find a better data structure / type to represent an object?
  IntermediateItem extends Record<string, any>,
> {
  /** Very short descriptive designation for this convertor. */
  label: string;

  /** User-friendly description of what to provide. */
  inputDescription: string;

  /** Deserializes given files into suitable intermediate structures. */
  parseInput: TransformStream<Input, IntermediateItem>;

  /** Parses intermediate structures into concepts. */
  readConcepts: TransformStream<IntermediateItem, LocalizedConceptData>;
}
