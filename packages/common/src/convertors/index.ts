import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept.js';
import type { Drafted as ProposalDraft } from '@riboseinc/paneron-registry-kit/types/cr.js';
import { State } from '@riboseinc/paneron-registry-kit/types/cr.js';
import type { RegisterItem, RegisterConfiguration, ItemClassConfiguration } from '@riboseinc/paneron-registry-kit/types';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { LinkParser, CommonStreamProcessingOptions } from './base.js';

export type { Convertor, FileConvertor, File } from './base.js';



// TODO: This should be possible to obtain using `typeof itemClassConfiguration`
// with Glossarist extension’s itemClassConfiguration, but TS somehow loses
// type information about register item payloads.
interface GlossaryRegisterConfig extends RegisterConfiguration<{
  'concept': ItemClassConfiguration<ConceptData>;
  'localized-concept': ItemClassConfiguration<LocalizedConceptData>;
}> {
  subregisters: undefined,
}


type GetRegisterItemPayloadType<T> =
  T extends ItemClassConfiguration<infer K> ? K : never;

type RegisterItemsByClassID<
  P extends RegisterConfiguration,
> = {
  [K in keyof P["itemClassConfiguration"]]?:
    RegisterItem<GetRegisterItemPayloadType<P["itemClassConfiguration"][K]>>
}


interface RegisterItemConversionOpts extends CommonStreamProcessingOptions {
  /** Returns a human-readable `identifier` for universal concept data. */
  conceptIDMaker?: (
    /** Zero-based index for current item in a stream. */
    idx: number,
    /** Concept entry. */
    conceptData: LocalizedConceptData,
  ) => string,
}


interface LinkProcessingOptions extends CommonStreamProcessingOptions {
  /**
   * If links are to be recognized, appropraite URN namespace is required.
   * This option should contain the entire URN prefix with trailing colon.
   * (Concept identifier will be appended to that prefix, and links
   * will be formatted with `{{` and `}}`.)
   */
  linkURNPrefix: string;
}


/**
 * Converts a stream of objects with register items keyed by class ID
 * to a proposal object.
 */
export async function asProposal(
  items: AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined>,
  proposalOptions: Pick<ProposalDraft, 'submittingStakeholderGitServerUsername' | 'registerVersion'>,
  opts?: CommonStreamProcessingOptions,
): Promise<{
  /** Proposal metadata. */
  proposalDraft: ProposalDraft,
  /** Register item data, for additions & possibly in future clarifications. */
  itemPayloads: Record<string, RegisterItem<any>>,
}> {
  const now = new Date();
  const id = crypto.randomUUID();
  const proposalDraft: ProposalDraft = {
    ...proposalOptions,
    id,
    timeStarted: now,
    timeEdited: now,
    state: State.DRAFT,
    justification: 'exported via Glossarist migration adapter',
    items: {},
  }
  opts?.onProgress?.(`Generated proposal ${id}`);
  const itemPayloads: Record<string, RegisterItem<any>> = {};
  for await (const item of items) {
    for (const [classID, registerItem] of Object.entries(item)) {
      const itemPath = `/${classID}/${registerItem.id}.yaml`;
      opts?.onProgress?.(`Appending addition to proposal: ${itemPath}`);
      proposalDraft.items[itemPath] = { type: 'addition' };
      itemPayloads[itemPath] = registerItem;
    }
  };
  return { proposalDraft, itemPayloads };
}


/**
 * Converts a stream of ID & localized concept tuples
 * to a stream of objects with register item keyed by class ID.
 */
export async function * asRegisterItems(
  concepts: AsyncGenerator<LocalizedConceptData, void, undefined>,
  opts?: RegisterItemConversionOpts,
): AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined> {
  const now = new Date();
  let idx = 0;

  for await (const conceptData of concepts) {
    const designation = conceptData.terms[0]!.designation;
    const identifier = opts?.conceptIDMaker?.(idx, conceptData) ?? `${idx + 1}`;
    opts?.onProgress?.(`Outputting as register items: #${idx + 1} (${designation}) (using ID “${identifier}”)`);
    const universalUUID = crypto.randomUUID();
    const localizedUUID = crypto.randomUUID();
    const universalConcept: RegisterItem<ConceptData> = {
      id: universalUUID,
      data: {
        identifier,
        localizedConcepts: {
          eng: localizedUUID,
        },
      },
      status: 'valid',
      dateAccepted: now,
    };
    const localizedConcept: RegisterItem<LocalizedConceptData> = {
      id: localizedUUID,
      data: conceptData,
      status: 'valid',
      dateAccepted: now,
    };

    yield {
      concept: universalConcept,
      'localized-concept': localizedConcept,
    };
    idx += 1;
  }
}


export async function * processLinks(
  linkParser: LinkParser,
  items: AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined>,
  opts: LinkProcessingOptions,
): AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined> {
  const [itemStream1, itemStream2] = teeAsync(items);

  // Populate cache for lookups
  const itemCache: {
    concept: RegisterItem<ConceptData>[],
    'localized-concept': RegisterItem<LocalizedConceptData>[],
  } = {
    concept: [],
    'localized-concept': [],
  };
  for await (const item of itemStream1) {
    if (item['concept']) {
      itemCache['concept'].push(item['concept']);
    }
    if (item['localized-concept']) {
      itemCache['localized-concept'].push(item['localized-concept']);
    }
  }

  for await (const item of itemStream2) {
    if (item['localized-concept']) {
      // Modify localized concept item data in-place,
      // resolving links if possible.
      const { id, data: { terms, definition, notes, examples } } = item['localized-concept'];
      const primaryDesignation = terms[0]!.designation;
      opts?.onProgress?.(`Formatting links for localized concept ${id} (${primaryDesignation})`);
      for (const val of [...definition, ...notes, ...examples]) {
        val.content = linkParser(val.content, {
          forMatchingDesignation: function formatLinkForMatchingDesignation(predicate) {
            const localizedConcept = itemCache['localized-concept'].find(({ data: { terms } }) => {
              return terms.find(predicate);
            });
            if (localizedConcept) {
                const universalConcept = itemCache['concept'].find(({ data: { localizedConcepts } }) => {
                  return localizedConcepts.eng === localizedConcept.id;
                });
                if (universalConcept) {
                  const linkedPrimaryDesignation = localizedConcept.data.terms[0]!.designation;
                  opts?.onProgress?.(`Resolved a link to ${linkedPrimaryDesignation}`);
                  return formatLink(
                    opts.linkURNPrefix,
                    universalConcept.data.identifier,
                    linkedPrimaryDesignation,
                  );
                } else {
                  opts?.onProgress?.(`Error: link resolver: no universal concept linking to ${localizedConcept.id}`);
                  return undefined;
                }
            } else {
              opts?.onProgress?.(`Error: link resolver: no localized concept with designation matching given predicate`);
              return undefined;
            }
          },
          forConceptID: function formatLinkForConceptID(conceptID) {
            return formatLink(opts.linkURNPrefix, conceptID);
          },
        });
      }
    }
    yield item;
  }
}


function formatLink(linkURNPrefix: string, conceptIdentifier: string, designation?: string): string {
  if (designation) {
    return `{{${linkURNPrefix!}${conceptIdentifier},${designation}}}`;
  } else {
    return `{{${linkURNPrefix!}${conceptIdentifier}}}`;
  }
}


export function tee<T>(iterable: Iterable<T>): [Generator<T>, Generator<T>] {
    const source = iterable[Symbol.iterator]();
    const buffers: [T[], T[]] = [[], []];
    const DONE = Object.create(null);

    function next(i: 0 | 1): T {
      if (buffers[i].length !== 0) {
        // Cast: we have at least one item for sure
        return buffers[i].shift()!;
      }

      const x = source.next();

      if (x.done) {
        return DONE;
      }

      // Cast: 1 - i can only be 0 or 1
      buffers[1 - i]!.push(x.value);
      return x.value;
    };

    function * gen (i: 0 | 1): Generator<T> {
      for (;;) {
        const x = next(i);

        if (x === DONE) {
          break;
        }

        yield x;
      }
    }

    return [gen(0), gen(1)];
}


export function teeAsync<T>(iterable: AsyncGenerator<T, void, undefined>):
[AsyncGenerator<T, void, undefined>, AsyncGenerator<T, void, undefined>] {
    const iterator = iterable[Symbol.asyncIterator]();
    const buffers: [
      Promise<IteratorResult<T, void>>[] | null,
      Promise<IteratorResult<T, void>>[] | null,
    ] = [[], []];

    const _AsyncIterator: AsyncIterator<T> =
    Object.getPrototypeOf(
      Object.getPrototypeOf(
        (async function * () {}).prototype
      )
    );

    function makeIterator(buffer: Promise<IteratorResult<T, void>>[] | null, i: 0 | 1) {
      return Object.assign(Object.create(_AsyncIterator), {
        next() {
          if (!buffer) {
            return Promise.resolve({done: true, value: undefined});
          }
          if (buffer.length !== 0) {
            return buffer.shift();
          }
          const result = iterator.next();
          buffers[1 - i]?.push(result);
          return result;
        },
        async return() {
          if (buffer) {
            buffer = buffers[i] = null;
            if (!buffers[1 - i]) {
              await iterator.return();
            }
          }
          return {done: true, value: undefined};
        },
      });
    }

    return [makeIterator(buffers[0], 0), makeIterator(buffers[1], 1)];

    // Is it possible to define it in a saner way, without the prototype magic?
    //const source = iterable[Symbol.asyncIterator]();
    //const buffers: [Promise<unknown>[], Promise<unknown>[]] = [[], []];
    //async function * gen (i: 0 | 1): AsyncGenerator<unknown, void, undefined> {
    //  for (;;) {
    //    const x = next(i);

    //    if (x === DONE) {
    //      break;
    //    }

    //    yield x;
    //  }
    //  return { done: true, value: undefined };
    //}

    //function next(i: 0 | 1): Promise<unknown> {
    //  if (buffers[i].length !== 0) {
    //    return buffers[i].shift()!;
    //  }

    //  const x = source.next();

    //  if (x.done) {
    //    return Promise.resolve({ done: true, value: undefined });
    //  }

    //  // Cast: 1 - i can only be 0 or 1
    //  buffers[1 - i]!.push(x.value);
    //  return x.value;
    //};
}
