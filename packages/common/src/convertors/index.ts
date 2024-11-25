import type { Drafted as ProposalDraft } from '@riboseinc/paneron-registry-kit/proposals/types.js';
import type { RegisterItem, RegisterConfiguration } from '@riboseinc/paneron-registry-kit/types';
import type {
  CommonStreamProcessingOptions,
  RegisterItemsByClassID,
} from './base.js';

export type { Convertor, FileConvertor, File } from './base.js';


/**
 * Converts a stream of objects with register items keyed by class ID
 * to a proposal object.
 */
export async function asProposal<R extends RegisterConfiguration>(
  items: AsyncGenerator<RegisterItemsByClassID<R>, void, undefined>,
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
    state: 'draft',  // State.DRAFT
    justification: 'imported from converter',
    items: {},
  };
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
