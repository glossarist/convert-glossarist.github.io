import type {
  RegisterItem,
  RegisterConfiguration,
  ItemClassConfiguration,
} from '@riboseinc/paneron-registry-kit/types';
import type { Predicate } from '@riboseinc/paneron-registry-kit/views/change-request/objectChangeset.js';
import type { CommonGRItemData, Extent } from '@riboseinc/paneron-extension-geodetic-registry/classes/common.js';
import type { DatumData } from '@riboseinc/paneron-extension-geodetic-registry/classes/datum.js';
import type { TransformationData } from '@riboseinc/paneron-extension-geodetic-registry/classes/transformation.js';
import type { ConversionData } from '@riboseinc/paneron-extension-geodetic-registry/classes/conversion.js';

import xlsx, { readSheetNames, type Row } from 'read-excel-file';

import type { FileConvertor } from '../../common/src/convertors/index.js';
import { teeAsync } from '../../common/src/util.js';


export interface GRSheetConvertor
extends FileConvertor<
  ParsedSheetItem,
  GRItem<CommonGRItemData>,
  GRConfig> {}


// TODO: This should be possible to obtain using `typeof itemClassConfiguration`
// with GR extension’s itemClassConfiguration, but TS somehow loses
// type information about register item payloads.
export interface GRConfig extends RegisterConfiguration<{
  "coordinate-ops--conversion": ItemClassConfiguration<ConversionData>,
  "coordinate-ops--transformation": ItemClassConfiguration<TransformationData>,
  "datums--engineering": ItemClassConfiguration<DatumData>,
}> {
  subregisters: undefined,
}


export const Sheets = {
  EXTENTS: 'Geo_Extent(GE#)',
  CITATIONS: 'Source_Citation(CI#)',
  TRANSFORMATION_PARAMS: 'ParamVal(PV#)',

  TRANSFORMATIONS: 'Coord_Trans(CT#)',
} as const;
type SheetName = typeof Sheets[keyof typeof Sheets];
function isSheetName(val: string): val is SheetName {
  return Object.values(Sheets).indexOf(val as typeof Sheets[keyof typeof Sheets]) >= 0;
}


/** Intermediate item obtained after deserializing a sheet into JS. */
interface ParsedSheetItem {
  /** Sheet name */
  sheet: SupportedSheetName;

  /** Raw row data as from parse-excel-file */
  rowRaw: Row;

  /** Row data somewhat parsed */
  rowParsed: Record<string, string>;
}


/** An output item representing some GR item (no register data). */
interface GRItem<T extends CommonGRItemData> {
  /** GR item class ID (e.g., transformation) */
  itemType: string;
  itemData: T;
}


export default function getConvertor(): GRSheetConvertor {
  return {
    label: "ISO GR sheet",
    inputDescription: "A custom TC XLSX spreadsheet containing items to be proposed",
    parseInput,
    generateItems,
    generateRegisterItems,
  };
}

const parseInput: GRSheetConvertor["parseInput"] =
async function * parseSpreadsheetFiles(fileGenerator, opts) {
  // We can assume there to be multiple files.
  for await (const file of fileGenerator()) {
    function fileProgress(msg?: string) {
      const prefix = `Processing file ${file.name}`;
      opts?.onProgress?.(msg ? `${prefix}: ${msg}` : prefix);
    }

    try {
      const sheetNames = await readSheetNames(file.blob);
      for (const sheet of sheetNames/*.filter(sheet => SKIP_SHEETS.indexOf(sheet) < 0)*/) {
        const rows: Row[] = await xlsx(file.blob, { sheet });
        for (const [idx, row] of rows.entries()) {
          if (idx < 3) {
            // Skip header rows
            continue;
          } else if (row[0] === null) {
            // Skip empty rows
            continue;
          } else if (!isSheetName(sheet)) {
            // Skip unrecognized sheets
            fileProgress(`Skipping unrecognized sheet ${sheet}`);
            continue;
          } else if (!isSupportedSheetName(sheet)) {
            // Skip unsupported sheets
            fileProgress(`WARNING: Skipping sheet ${sheet}: not yet supported`);
            continue;
          }
          const processor = SupportedSheets[sheet];
          yield {
            sheet,
            rowRaw: row,
            rowParsed:
              processor.fields.
                map((fname, idx) => ({ [fname as string]: `${row[idx]}` })).
                reduce((prev, curr) => ({ ...prev, ...curr })),
          };
        }
      }
    } catch (e) {
      fileProgress(`Error: ${(e as any).toString?.() ?? "No error information available"}`);
    }
  }
}


const generateItems: GRSheetConvertor["generateItems"] =
async function * generateGRItems(parsedSheetItems, opts) {
  const [stream1, stream2] = teeAsync(parsedSheetItems());

  const cache = await cacheItems(stream1);

  for await (const sheetItem of stream2) {
    // Process actual items
    const processor = SupportedSheets[sheetItem.sheet];
    if (isItemProcessor(processor)) {
      const item = processor.toItem(sheetItem.rowParsed, function resolveRelated(sheet, id) {
        return cache[sheet][id];
      });
      console.debug("Processed", sheetItem, "into", item);
      opts?.onProgress?.(`Creating GR item ${item.itemType}`);
      yield item;
    } else {
      console.debug("Skipping item", sheetItem);
      opts?.onProgress?.(`Skipping ${sheetItem.sheet}/${sheetItem.rowRaw[0]}`);
    }
  }
}


const generateRegisterItems: GRSheetConvertor["generateRegisterItems"] =
async function * generateGRItems(grItems, opts) {
  // Current timestamp
  const dateAccepted = new Date();
  let idx = 0;
  for await (const { itemType, itemData } of grItems) {
    const id = crypto.randomUUID();
    const item: RegisterItem<any> = {
      id,
      data: itemData,
      dateAccepted,
      status: 'valid',
    }
    yield {
      [itemType]: item,
    }
    opts?.onProgress?.(`Outputting as register items: #${idx + 1} (UUID “${id}”)`);
  }
}


/** Spec for a particular sheet to be processed. */
interface BaseSheetItemProcessor<T> {
  /**
   * Which column maps to which field in the object produced.
   * `null` means column data is ignored.
   */
  fields: (((keyof T) & string) | null)[];
}
/** Spec for a sheet to be processed into individual GR items. */
interface RegisteredItemProcessor<T, I extends CommonGRItemData> extends BaseSheetItemProcessor<T> {
  toItem: (item: T, resolveRelatedFromSheet: (sheet: NonItemSheetName, id: string) => unknown) => GRItem<I>;
}
function isItemProcessor(val: BaseSheetItemProcessor<any>): val is RegisteredItemProcessor<any, any> {
  return val.hasOwnProperty('toItem');
}
/** Exists to work around generic typing of sheet processor interfaces. */
function makeProcessor<T>(p: BaseSheetItemProcessor<T>): BaseSheetItemProcessor<T> {
  return p;
}
/** Exists to work around generic typing of sheet processor interfaces. */
function makeItemProcessor<T, I extends CommonGRItemData>(p: RegisteredItemProcessor<T, I>): RegisteredItemProcessor<T, I> {
  return p;
}

const SupportedSheets = {
  [Sheets.TRANSFORMATIONS]: makeItemProcessor({
    fields: ['sheetID', 'name', 'aliases', 'sourceCRS', 'targetCRS', null, 'scope', 'remarks', 'method', 'extent', 'params', 'operationVersion', 'accuracy', 'citation', 'registerManagerNotes', 'controlBodyNotes', null, 'check'],
    toItem: function toTransformation(item, resolveRelated) {
      const [extentID] = extractItemID(item.extent);
      const extent = resolveRelated('Geo_Extent(GE#)', extentID) as Extent;
      const c: ReplaceKeys<
        UsePredicates<TransformationData, 'sourceCRS' | 'targetCRS'>,
        'accuracy',
        UsePredicates<TransformationData["accuracy"], 'unitOfMeasurement'>
      > = {
        name: item.name,
        identifier: 0,
        remarks: item.remarks,
        operationVersion: item.operationVersion,
        // TODO: Not required, UoM is always metre.
        accuracy: parseValueWithUoM(item.accuracy),
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        sourceCRS: makePredicate(item.sourceCRS, 'generic'),
        targetCRS: makePredicate(item.targetCRS, 'generic'),
        extent,
        informationSources: [],
        parameters: [],
      };
      return { itemType: 'coordinate-ops--transformation', itemData: c };
    },
  }),
  [Sheets.EXTENTS]: makeProcessor({
    fields: ['sheetID', 'description', 's', 'w', 'n', 'e', 'polygon', 'startDate', 'finishDate', null, 'check'],
  }),
} as const;
type SupportedSheetName = keyof typeof SupportedSheets;
function isSupportedSheetName(val: string): val is SupportedSheetName {
  return SupportedSheets[val as SupportedSheetName] !== undefined;
}


type ReplaceKeys<T, Keys extends keyof T, WithType> = Omit<T, Keys> & { [key in Keys]: WithType };
type UsePredicates<T, Keys extends keyof T> = ReplaceKeys<T, Keys, Predicate>;


/**
 * Extracts referenced item and returns a tuple of
 * [referenced item ID, remaining cell contents].
 */
const REFERENCE_SEPARATOR = ' - ';
function extractItemID(cellValue: string): [string, string] {
  const parts: string[] = cellValue.split(REFERENCE_SEPARATOR);
  if (parts.length < 2) {
    throw new Error(`Unable to extract a reference from ${cellValue}`);
  }

  const [id, ...remainingParts] = parts as [string, string[]];
  // ^ Cast because we’re sure there’re enough parts

  return [id, remainingParts.join(REFERENCE_SEPARATOR)];
}


function makePredicate(
  cellWithReference: string,
  mode: Predicate["mode"],
): Predicate {
  const [id] = extractItemID(cellWithReference);

  // Preexisting items must be referenced by numerical identifiers.
  const idNum = parseInt(id, 10);

  return {
    __isPredicate: true,
    mode,
    predicate: `data.identifier === ${idNum}`,
  };
}

/**
 * Separates value with UoM into a numerical value
 * and UoM pointer.
 */
function parseValueWithUoM(raw: string): { value: number, unitOfMeasurement: Predicate } {
  const value = parseInt(raw.substring(0, raw.length - 1), 10);
  let uomAlias: any;
  let uomRaw = raw.slice(raw.length - 1);
  try {
    uomAlias = parseInt(uomRaw, 10);
    // If uomAlias parses as a number, it’s not real.
    uomAlias = 'm';
  } catch (e) {
    uomAlias = uomRaw;
  }
  return {
    value,
    unitOfMeasurement: {
      __isPredicate: true,
      mode: 'id',
      predicate: `data.aliases?.indexOf("${uomAlias}") >= 0`,
    }
  };
}


/** Indexes row data by first column (ID), groups by sheet. */
type CachedItems = Record<NonItemSheetName, Record<string, Record<string, string>>>;

const CACHE_SHEETS = [Sheets.CITATIONS, Sheets.EXTENTS, Sheets.TRANSFORMATION_PARAMS] as const;

// TODO: cache ALL items, not just non-register items.
// Register items being added may reference other register items,
// not just non-items like extents/citations.
// TODO: Extents, citations will be their own items.
/** Sheets with items to be cached but not converted to register items. */
type NonItemSheetName = typeof CACHE_SHEETS[number];
function isCachedSheet(val: string): val is NonItemSheetName {
  return CACHE_SHEETS.indexOf(val as NonItemSheetName) >= 0;
}

async function cacheItems(
  items: AsyncGenerator<ParsedSheetItem, void, undefined>,
) {
  const cache: CachedItems = {
    [Sheets.EXTENTS]: {},
    [Sheets.CITATIONS]: {},
    [Sheets.TRANSFORMATION_PARAMS]: {},
  };
  for await (const item of items) {
    if (isCachedSheet(item.sheet)) {
      cache[item.sheet] ??= {};
      cache[item.sheet][item.rowRaw[0]] = item.rowParsed;
    }
  }
  return cache;
}
