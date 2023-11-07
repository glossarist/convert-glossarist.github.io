import type {
  RegisterItem,
  RegisterConfiguration,
  ItemClassConfiguration,
  InternalItemReference,
} from '@riboseinc/paneron-registry-kit/types';
import type { Predicate } from '@riboseinc/paneron-registry-kit/views/change-request/objectChangeset.js';
import type { CommonGRItemData, Extent } from '@riboseinc/paneron-extension-geodetic-registry/classes/common.js';
import type { DatumData, GeodeticDatumData } from '@riboseinc/paneron-extension-geodetic-registry/classes/datum.js';
import type { TransformationParameter, TransformationData } from '@riboseinc/paneron-extension-geodetic-registry/classes/transformation.js';
import type { ConversionParameter, ConversionData } from '@riboseinc/paneron-extension-geodetic-registry/classes/conversion.js';
import type { CoordinateSystemData } from '@riboseinc/paneron-extension-geodetic-registry/classes/coordinate-systems.js';
import type { CoordinateSystemAxisData } from '@riboseinc/paneron-extension-geodetic-registry/classes/coordinate-sys-axis.js';
import type { CoordinateOpMethod } from '@riboseinc/paneron-extension-geodetic-registry/classes/coordinate-op-method.js';
import type { UoMData } from '@riboseinc/paneron-extension-geodetic-registry/classes/unit-of-measurement.js';
import type {
  //CompoundCRSData,
  NonCompoundCRSData,
  //VerticalCRSData,
  //GeodeticCRSData,
  // ProjectedCRSData,
  // EngineeringCRSData,
} from '@riboseinc/paneron-extension-geodetic-registry/classes/crs.js';

import xlsx, { readSheetNames, type Row } from 'read-excel-file';

import type { FileConvertor } from '../../common/src/convertors/index.js';
import { teeAsync } from '../../common/src/util.js';


// Duplicating from GR extension b/c we cannot import it due to bad packaging
export const ParameterType = {
  FILE: 'parameter file name',
  MEASURE: 'measure (w/ UoM)',
} as const;


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
  "coordinate-sys-axis": ItemClassConfiguration<CoordinateSystemAxisData>,
  "coordinate-system": ItemClassConfiguration<CoordinateSystemData>,
  "datums--engineering": ItemClassConfiguration<DatumData>,
}> {
  subregisters: undefined,
}

// /**
//  * Maps
//  * sheet ID aliases (initial part of e.g. CA#, CS#)
//  * to
//  * item class IDs
//  *
//  */
// const ItemClassSheetIDPrefixes:
// Record<string, (parsedRow: Record<string, string>) => keyof GRConfig["itemClassConfiguration"]> = {
//   CA: () => 'coordinate-sys-axis',
//   CS: () => 'coordinate-system',
//   CR: (row) => `crs--${row.type!.split(' ')[0]!.toLowerCase()}`,
// } as const;

export const Sheets = {
  EXTENTS: `Geo_Extent(GE#)`,
  CITATIONS: 'Source_Citation(CI#)',
  OPERATION_PARAM_VALUES: 'ParamVal(PV#)',
  COORDINATE_OP_PARAMS: 'OpParam(OP#)',
  COORDINATE_OP_METHODS: 'OpMethod(OM#)',

  TRANSFORMATIONS: 'Coord_Trans(CT#)',
  CONVERSIONS: 'Coord_Conv(CC#)',
  COMPOUND_CRS: 'CompCRS(CM#)',
  NON_COMPOUND_CRS: 'CRS(CR#)',

  COORDINATE_SYSTEMS: 'CoordSys(CS#)',
  COORDINATE_SYSTEM_AXES: 'CSAxis(CA#)',
  UOM: 'UoM(UM#)',

  DATUMS: 'Datum(CD#)',
} as const;
type SheetName = typeof Sheets[keyof typeof Sheets];
function isSheetName(val: string): val is SheetName {
  return Object.values(Sheets).indexOf(val as typeof Sheets[keyof typeof Sheets]) >= 0;
}


/** Extracts the “CS” part from a sheet name like “CoordSys(CS#)”. */
function getSheetIDAlias(sheetName: string): string {
  return sheetName.split('(')[1]!.slice(0, 2);
}
/** Converts “CS” to full sheet name like “CoordSys(CS#)”. */
function getSheetName(alias: string): SheetName {
  const sheetName = Object.values(Sheets).find(sheetName => getSheetIDAlias(sheetName) === alias);
  if (sheetName && isSheetName(sheetName)) {
    return sheetName;
  } else {
    console.warn("Possible aliases", Object.values(Sheets).map(sheetName => getSheetIDAlias(sheetName)));
    throw new Error(`Unable to get sheet name from ${alias} (got ${sheetName})`);
  }
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
  itemRef: InternalItemReference;
  itemData: T;
}


export default function getConvertor(): GRSheetConvertor {
  return {
    label: "ISO GR sheet",
    inputDescription: "One or more TC 211 GR v6 spreadsheet files, in XLSX format, containing proposed additions",
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
                map((fname, idx) => ({
                  [fname as string]:
                    // Avoid nulls
                    row[idx]
                      ? `${row[idx]}`
                      : ''
                })).
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

  opts?.onProgress?.("Caching items");
  const cache = await cacheItems(stream1);

  const idMap: TemporaryIDMap = {};
  let availableID = -1;

  const getOrCreateIdentifiers = function (rowParsed: Record<string, string>): { ref: InternalItemReference, identifier: number } {
    if (!rowParsed.sheetID) {
      throw new Error("No sheetID in parsed row, cannot get or create identifiers");
    }
    if (!idMap[rowParsed.sheetID]) {
      const sheetName = getSheetName(rowParsed.sheetID.slice(0, 2));
      const processor = SupportedSheets[sheetName];

      if (isRegisterItemProcessor(processor)) {
        const classID = processor.getClassID(rowParsed);
        const itemID = crypto.randomUUID();
        const itemRef = { classID, itemID };
        const identifier = availableID;
        availableID = availableID - 1;
        idMap[rowParsed.sheetID] = { ref: itemRef, identifier };

      } else {
        throw new Error(`Unable to create a reference for a non-register item procesor (${sheetName})`);
      }
    }
    return idMap[rowParsed.sheetID]!;
  }

  const resolveReference = function (cellContents: string, mode: Predicate["mode"]): Predicate | InternalItemReference | string {
    const itemID = extractItemID(cellContents);
    try {
      const item = resolveRelated(itemID);
      if (item) {
        const ref = getOrCreateIdentifiers(item).ref;
        return mode === 'generic' ? ref : ref.itemID;
      } else {
        console.warn(`Referenced item ${itemID} cannot be found in this proposal`, item);
      }
    } catch (e) {
      console.warn(`Referenced item ${itemID} cannot be found in this proposal`, cellContents, e);
      return predicate(
        makePredicateQuery(itemID),
        mode,
      );
    }
    opts?.onProgress?.(`Referenced item ${itemID} cannot be found in this proposal`);
    throw new Error(`Unable to resolve reference, ${itemID}`);
  }

  const resolveRelated = function resolveRelated(sheetItemID: string) {
    const sheetName = getSheetName(sheetItemID.slice(0, 2));
    if (cache[sheetName]) {
      const parsedRow = cache[sheetName]![sheetItemID];
      if (parsedRow) {
        return parsedRow;
      } else {
        console.warn("Cache for sheet", sheetName, cache[sheetName]);
        throw new Error(`Cannot resolve related item ${sheetItemID}`);
      }
    } else {
      console.warn("ALL CACHE", cache);
      throw new Error(`Cannot resolve item from sheet ${sheetName} (no data for that sheet)`);
    }
  }

  const constructItem = function constructItem(parsedRow: Record<string, string>): unknown {
    const sheetName = getSheetName(parsedRow.sheetID!.slice(0, 2));
    const processor = SupportedSheets[sheetName];
    if (isRegisterItemProcessor(processor)) {
      return processor.toRegisterItem(parsedRow, resolveAndConstruct, resolveReference);
    } else if (isBasicSheetItemProcessor(processor)) {
      return processor.toItem(parsedRow, resolveAndConstruct, resolveReference);
    } else {
      throw new Error("Unknown processor");
    }
  }

  const resolveAndConstruct = function resolveAndConstruct(sheetItemID: string): unknown {
    return constructItem(resolveRelated(sheetItemID));
  }

  for await (const sheetItem of stream2) {
    // Process actual items
    const processor = SupportedSheets[sheetItem.sheet];
    if (isRegisterItemProcessor(processor)) {
      let parsedItem: Omit<CommonGRItemData, 'identifier'>;

      if (!sheetItem.rowParsed.sheetID) {
        throw new Error(`Sheet ID column is missing in parsed row data, ${sheetItem.rowParsed}`);
      }

      const { ref: itemRef, identifier } = getOrCreateIdentifiers(sheetItem.rowParsed);

      try {
        opts?.onProgress?.(`Handling GR item ${sheetItem.rowParsed.sheetID}`);
        parsedItem = processor.toRegisterItem(
          sheetItem.rowParsed,
          resolveRelated,
          resolveReference,
        );

      } catch (e) {
        console.warn("Unable to transform sheet row to item", sheetItem.sheet, sheetItem.rowParsed, e);
        throw e;
      }

      console.debug("Processed", sheetItem, "into", parsedItem);
      opts?.onProgress?.(`Creating GR item ${itemRef.classID}`);

      yield {
        itemData: {
          identifier,
          ...parsedItem,
        },
        itemRef,
      };

    } else {
      console.debug("Skipping item", sheetItem);
      opts?.onProgress?.(`Skipping ${sheetItem.sheet}/${sheetItem.rowRaw[0]}`);
    }
  }
}


const generateRegisterItems: GRSheetConvertor["generateRegisterItems"] =
async function * generateRegisteredGRItems(grItems, opts) {
  // Current timestamp
  const dateAccepted = new Date();
  let idx = 0;
  for await (const { itemRef, itemData } of grItems) {
    const item: RegisterItem<any> = {
      id: itemRef.itemID,
      data: itemData,
      dateAccepted,
      status: 'valid',
    };
    yield {
      [itemRef.classID]: item,
    }
    opts?.onProgress?.(`Outputting as register items: #${idx + 1} (UUID “${itemRef.itemID}”)`);
  }
}


/** Spec for a particular sheet to be processed. */
interface BaseSheetItemProcessor<T, I> {
  /**
   * Which column maps to which field in the object produced.
   * `null` means column data is ignored.
   */
  fields: (((keyof T) & string) | null)[];
  toItem: (
    /** Row parsed into fields based on `fields` spec given. */
    item: ReplaceKeys<WithCommonFields<T>, keyof WithCommonFields<T>, string>,
    /** Retrieve entire item data. For non-register items from other sheets, e.g. extents. */
    getSheetItem: (sheetItemID: string) => unknown | undefined,
    /**
     * Resolve link, either to predicate to resolve a preexisting register item at import time
     * or as `InternalItemReference` referencing item being added in the same proposal.
     */
    resolveReference: (rawCellContents: string, mode: Predicate["mode"]) => Predicate | InternalItemReference | string,
  ) => I;
}
function isBasicSheetItemProcessor(val: unknown): val is BaseSheetItemProcessor<any, any> {
  return val && val.hasOwnProperty('toItem') ? true : false;
}
/** Spec for a sheet to be processed into individual GR items. */
interface RegisteredItemProcessor<T, I> extends Omit<BaseSheetItemProcessor<T, I>, 'toItem'> {
  getClassID: (item: ReplaceKeys<T, keyof T, string>) => string;
  toRegisterItem: (
    /** Row parsed into fields based on `fields` spec given. */
    item: ReplaceKeys<WithCommonRegisterItemFields<T>, keyof WithCommonRegisterItemFields<T>, string>,
    /** Retrieve entire item data. For non-register items from other sheets, e.g. extents. */
    getSheetItem: (sheetItemID: string) => unknown | undefined,
    /**
     * Resolve link, either to predicate to resolve a preexisting register item at import time
     * or as `InternalItemReference` referencing item being added in the same proposal.
     */
    resolveReference: (rawCellContents: string, mode: Predicate["mode"]) => Predicate | InternalItemReference | string,
  ) => Omit<I, 'identifier'>;
}
function isRegisterItemProcessor(val: unknown): val is RegisteredItemProcessor<any, any> {
  return val && val.hasOwnProperty('getClassID') ? true : false;
}
/** Fields common for all item processors, including non-register-item. */
type CommonFields = 'sheetID'
type WithCommonFields<T> = T & { [K in CommonFields]: string }
function makeProcessor<T extends WithCommonFields<any>, I>
(p: BaseSheetItemProcessor<Omit<T, CommonFields>, I>):
BaseSheetItemProcessor<T, I> {
  (p as BaseSheetItemProcessor<WithCommonFields<T>, I>).fields = [
    'sheetID',
    ...p.fields,
  ];
  return p;
}
/** Fields common for register item processors. */
type CommonRegisterItemFields = CommonFields | 'sheetID' | 'justification' | 'registerManagerNotes' | 'controlBodyNotes' | 'check'
type WithCommonRegisterItemFields<T> = T & { [K in CommonRegisterItemFields]: string }
function makeItemProcessor<T extends WithCommonRegisterItemFields<any>, I extends CommonGRItemData>
(p: RegisteredItemProcessor<Omit<T, CommonRegisterItemFields>, I>):
RegisteredItemProcessor<T, I> {
  (p as RegisteredItemProcessor<WithCommonRegisterItemFields<T>, I>).fields = [
    'sheetID',
    ...p.fields,
    'justification',
    'registerManagerNotes',
    'controlBodyNotes',
    null,
    'check',
  ];
  return p;
}

const SupportedSheets = {
  [Sheets.TRANSFORMATIONS]: makeItemProcessor({
    fields: [
      'name', 'aliases', 'sourceCRS', 'targetCRS',
      null,  // <- Operation type (always “transformation”)
      'scope', 'remarks', 'method', 'extent', 'params', 'operationVersion', 'accuracy', 'citation'],
    getClassID: function () {
      return 'coordinate-ops--transformation';
    },
    toRegisterItem: function toTransformation(item, resolveRelated, resolveReference) {
      const extent = resolveRelated(extractItemID(item.extent));
      //const itemData: Omit<ReplaceKeys<
      //  UsePredicates<TransformationData, 'sourceCRS' | 'targetCRS'>,
      //  'accuracy',
      //  UsePredicates<TransformationData["accuracy"], 'unitOfMeasurement'>
      //>, 'identifier'> =
      return {
        name: item.name,
        remarks: item.remarks,
        operationVersion: item.operationVersion,
        // TODO: Not required, UoM is always metre.
        accuracy: parseValueWithUoM(item.accuracy),
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        sourceCRS: resolveReference(item.sourceCRS, 'generic'),
        targetCRS: resolveReference(item.targetCRS, 'generic'),
        extent,
        informationSources: [],
        parameters: [],
      };
      // return itemData;
    },
  }),
  [Sheets.CONVERSIONS]: makeItemProcessor({
    fields: ['name', 'aliases', null, 'scope', 'remarks', 'coordinateOperationMethod', 'extent', 'parameters', 'citation'],
    getClassID: () => 'coordinate-ops--conversion',
    toRegisterItem: function toConversion(item, resolveRelated, resolveReference) {
      const extent = resolveRelated(extractItemID(item.extent));
      if (!extent) {
        throw new Error("No extent!");
      }
      const parameters = item.parameters.split(';').
        map(p => p.trim()).
        map(paramSheetID => resolveRelated(paramSheetID) as TransformationParameter).
        map(({ type, name, value, unitOfMeasurement, parameter }) => {
          if (type === ParameterType.FILE) {
            throw new Error("“Reference File” parameters are not supported on Conversions");
          }
          const param: ConversionParameter = {
            name,
            value,
            parameter,
            unitOfMeasurement,
          };
          return param;
        });
      return {
        name: item.name,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        coordinateOperationMethod: resolveReference(item.coordinateOperationMethod, 'id'),
        parameters,
        extent,
        remarks: item.remarks,
        informationSources: [],
      }
    },
  }),
  [Sheets.COMPOUND_CRS]: makeItemProcessor({
    fields: ['name', 'aliases', 'scope', 'remarks', 'horizontalCRS', 'verticalCRS', 'extent', 'citation'],
    getClassID: () => 'crs--compound',
    toRegisterItem: function toCompoundCRS(item, resolveRelated, resolveReference) {
      const extent = resolveRelated(extractItemID(item.extent));
      if (!extent) {
        throw new Error("No extent!");
      }
      return {
        name: item.name,
        remarks: item.remarks,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        horizontalCRS: resolveReference(item.horizontalCRS, 'generic'),
        verticalCRS: resolveReference(item.verticalCRS, 'generic'),
        extent,
        informationSources: [],
        scope: item.scope,
      };
    },
  }),
  [Sheets.NON_COMPOUND_CRS]: makeItemProcessor({
    fields: ['name', 'aliases', 'scope', 'remarks', 'type', 'datum', 'coordinateSystem', 'baseCRS', 'operation', 'extent', 'citation'],
    getClassID: (row) => `crs--${row.type.split(' ')[0]!.toLowerCase()}`,
    toRegisterItem: function toNonCompoundCRS(item, resolveRelated, resolveReference) {
      const extent = resolveRelated(extractItemID(item.extent)) as unknown as Extent;

      type NonCompoundCRSPredicateFieldNames = 'coordinateSystem' | 'baseCRS' | 'operation';
      type SharedData = Omit<UsePredicates<NonCompoundCRSData, NonCompoundCRSPredicateFieldNames>, 'identifier'>;
      const shared: SharedData = {
        name: item.name,
        scope: item.scope,
        remarks: item.remarks,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        coordinateSystem: resolveReference(item.coordinateSystem, 'generic'),
        baseCRS: resolveReference(item.baseCRS, 'generic'),
        operation: resolveReference(item.operation, 'generic'),
        extent,
        informationSources: [],
      };

      switch (item.type) {
        case 'Vertical CRS':
          return {
            ...shared,
            datum: resolveReference(item.datum, 'id'),
          };
        case 'Geodetic CRS':
          return {
            ...shared,
            datum: resolveReference(item.datum, 'id'),
          };
        // case 'Engineering CRS':
        //   itemType = 'crs--engineering';
        // case 'Projected CRS':
        //   itemType = 'crs--projected';
        default:
          throw new Error(`Unknown CRS type: ${item.type}`);
      }
    },
  }),
  [Sheets.COORDINATE_SYSTEMS]: makeItemProcessor({
    fields: ['name', 'aliases', 'type', 'remarks', 'coordinateSystemAxes', 'citation'],
    getClassID: (row) => `crs--${row.type.replace(" Coordinate System", '').trim().toLowerCase()}`,
    toRegisterItem: function toCoordinateSystem(item, _resolveRelated, resolveReference) {
      const axes = item.coordinateSystemAxes.split(';').
        map(a => a.trim()).
        map(axisID => resolveReference(axisID, 'id'));

      return {
        name: item.name,
        remarks: item.remarks,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        coordinateSystemAxes: axes,
        informationSources: [],
      };
    },
  }),
  [Sheets.COORDINATE_SYSTEM_AXES]: makeItemProcessor({
    fields: ['name', 'aliases', 'remarks', 'abbreviation', 'orientation', 'unitOfMeasurement', 'minimumValue', 'maximumValue', 'rangeMeaning', 'citation'],
    getClassID: () => 'coordinate-sys-axis',
    toRegisterItem: function toCoordinateSystemAxis(item, _resolveRelated, resolveReference) {
      return {
        name: item.name,
        remarks: item.remarks,
        orientation: item.orientation,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        abbreviation: item.abbreviation,
        unitOfMeasurement: resolveReference(item.unitOfMeasurement, 'id'),
        informationSources: [],
      };
    },
  }),
  [Sheets.UOM]: makeItemProcessor({
    fields: ['name', 'aliases', 'remarks', 'baseUnit', 'numerator', 'denominator', 'measureType', 'maximumValue', 'symbol', 'citation'],
    getClassID: () => 'unit-of-measurement',
    toRegisterItem: function toUoM(item, _resolveRelated, resolveReference) {
      const c: Omit<UoMData, 'baseUnit' | 'identifier'> & { baseUnit?: Predicate | string } = {
        name: item.name,
        remarks: item.remarks,
        symbol: item.symbol,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        numerator: item.numerator.trim() !== '' ? parseInt(item.numerator, 10) : null,
        denominator: item.denominator.trim() !== '' ? parseInt(item.denominator, 10) : null,
        // XXX
        measureType: item.measureType as any,
        informationSources: [],
      };
      if (item.baseUnit?.trim?.() != '') {
        c.baseUnit = resolveReference(item.baseUnit, 'id') as string | Predicate;
      }
      return c;
    },
  }),
  [Sheets.COORDINATE_OP_PARAMS]: makeItemProcessor({
    fields: ['name', 'alias', 'remarks', 'minimumOccurs', 'citation'],
    getClassID: () => 'coordinate-op-parameter',
    toRegisterItem: function parseCoordinateOpParam({ name, alias, remarks, minimumOccurs, citation }) {
      return {
        name,
        aliases: alias.split(';').map((a: string) => a.trim()),
        remarks,
        minimumOccurs: parseInt(minimumOccurs.trim(), 10),
        informationSources: [],
      };
    },
  }),
  [Sheets.COORDINATE_OP_METHODS]: makeItemProcessor({
    fields: ['name', 'aliases', 'remarks', 'parameters', 'formula', 'citation', 'sourceCRSDimensionCount', 'targetCRSDimensionCount'],
    getClassID: () => 'coordinate-op-method',
    toRegisterItem: function parseCoordinateOpMethod({ name, aliases, remarks, parameters, formula, citation, sourceCRSDimensionCount, targetCRSDimensionCount }, resolveRelated, resolveReference) {
      const item: Omit<UsePredicateLists<CoordinateOpMethod, 'parameters'>, 'identifier'> = {
        name,
        remarks,
        aliases: aliases.split(';').map((a: string) => a.trim()),
        // sourceCRSDimensionCount: sourceCRSDimensionCount.trim() !== '' ? parseInt(sourceCRSDimensionCount, 10) : null,
        // targetCRSDimensionCount: targetCRSDimensionCount.trim() !== '' ? parseInt(targetCRSDimensionCount, 10) : null,
        parameters: parameters.trim() !== ''
          ? parameters.split(';').map(paramUUID => resolveReference(paramUUID, 'id'))
          : [],
        informationSources: [],
        // citation: resolveRelated(citation),
        // formula,
      };
      return item;
    },
  }),
  [Sheets.DATUMS]: makeItemProcessor({
    fields: ['name', 'aliases', 'type', 'scope', 'remarks', 'originDescription', 'ellipsoid', 'primeMeridian', 'releaseDate', 'coordinateReferenceEpoch', 'extent', 'citation'],
    getClassID: ({ type }) => (type === 'Vertical Datum' ? 'datums--vertical' : 'datums--geodetic'),
    toRegisterItem: function parseDatum({ name, scope, remarks, originDescription, releaseDate, ...item }, resolveRelated, resolveReference) {
      const extent = resolveRelated(extractItemID(item.extent)) as Extent | undefined;
      if (!extent) {
        throw new Error("No extent!");
      }
      const sharedData: Omit<DatumData, 'identifier'> = {
        name,
        aliases: item.aliases.split(';').map((a: string) => a.trim()),
        scope,
        remarks,
        originDescription,
        releaseDate,
        informationSources: [],
        extent,
        coordinateReferenceEpoch: item.coordinateReferenceEpoch.trim() || null,
      } as const;
      if (item.type === 'GeodeticDatum') {
        const d: Omit<UsePredicates<GeodeticDatumData, 'ellipsoid' | 'primeMeridian'>, 'identifier'> = {
          ...sharedData,
          ellipsoid: resolveReference(item.ellipsoid, 'id'),
          primeMeridian: resolveReference(item.primeMeridian, 'id'),
        };
        return d;
      } else {
        if (item.ellipsoid || item.primeMeridian) {
          throw new Error("Ellipsoid and prime meridian are not recognized as properties of a Geodetic Datum");
        }
        return sharedData;
      }
    },
  }),
  [Sheets.OPERATION_PARAM_VALUES]: makeProcessor({
    fields: [
      'parameter',
      null, // <- Link to transformation -- useless? We link from transformation to here instead
      'type', 'value', 'unitOfMeasurement',
      null, // <- UoM name -- redundant?
      'fileRef', 'citation',
    ],
    toItem: function parseTransformationParam({ parameter, type, value, unitOfMeasurement, fileRef, citation }, _resolveRelated, resolveReference) {
      const c: ReplaceKeys<UsePredicates<TransformationParameter, 'parameter'>, 'unitOfMeasurement', string | Predicate | null> = {
        parameter: resolveReference(parameter, 'id') as string | Predicate,
        type: type === "Reference File"
          ? ParameterType.FILE
          : ParameterType.MEASURE,
        unitOfMeasurement: type !== "Reference File"
          ? resolveReference(unitOfMeasurement, 'id') as string | Predicate
          : null,
        value: type === "Reference File"
          ? fileRef
          : value,
        name: '', // XXX: name seems unused
        fileCitation: citation || null,
      };
      return c;
    },
  }),
  [Sheets.EXTENTS]: makeProcessor({
    fields: ['description', 's', 'w', 'n', 'e', 'polygon', 'startDate', 'finishDate'],
    toItem: ({ description, s, w, n, e }) => ({ name: description, s, w, n, e }),
  }),
  [Sheets.CITATIONS]: makeProcessor({
    fields: ['title', 'alternateTitles', 'author', 'publisher', 'publicationDate', 'revisionDate', 'edition', 'editionDate', 'seriesName', 'issue', 'page', 'otherDetails', 'uri'],
    toItem: function parseCitation ({ title, publisher }) {
      return {
        title,
        //alternateTitles: item.alternateTitles.split(';').map(t => t.trim()),
        publisher,
      };
    },
  }),
} as const;
type SupportedSheetName = keyof typeof SupportedSheets;
function isSupportedSheetName(val: string): val is SupportedSheetName {
  return SupportedSheets[val as SupportedSheetName] !== undefined;
}


type ReplaceKeys<T, Keys extends keyof T, WithType> = Omit<T, Keys> & { [key in Keys]: WithType };
type UsePredicates<T, Keys extends keyof T> = ReplaceKeys<T, Keys, Predicate | InternalItemReference | string>;
type UsePredicateLists<T, Keys extends keyof T> = ReplaceKeys<T, Keys, (Predicate | InternalItemReference | string)[]>;


/**
 * Extracts referenced item ID from raw cell contents.
 */
const REFERENCE_SEPARATOR = ' - ';
function extractItemID(cellValue: string): string {
  let id: string;
  if (cellValue.indexOf(REFERENCE_SEPARATOR) > 1) {
    const parts: string[] = cellValue.split(REFERENCE_SEPARATOR);
    if (parts.length < 2) {
      throw new Error(`Unable to extract a reference from ${cellValue}`);
    }

    id = parts[0]!;
  } else {
    id = cellValue.trim();
  }
  return id;
  //const [id, ] = parts as [string, string[]];
  // ^ Cast because we’re sure there’re enough parts
  //return id
  //return [id, remainingParts.join(REFERENCE_SEPARATOR)];
}


/** Maps sheet IDs, like CM1, to item refs and temporary GR identifiers. */
type TemporaryIDMap = Record<string, { ref: InternalItemReference, identifier: number }>;

/**
 * Returns predicate if preexisting item’s numeric ID is found in raw cell data;
 * otherwise assumes it’s cross-referencing an item added in the same proposal,
 * so looks up or generates a new temporary ID and UUID for the item in question
 * and (depending on given predicate mode)
 * returns either InternalItemReference or item ID string.
 */
function makePredicateQuery(
  sheetItemID: string,
): string {
  // Preexisting items are referenced by numerical identifiers in the sheet.
  let idNum: number | undefined = undefined;
  try {
    idNum = parseInt(sheetItemID, 10);
  } catch (e) {
    idNum = undefined;
  }
  idNum = typeof idNum === 'number' && (idNum > 0 || idNum < 0)
    ? idNum
    : undefined;

  // idNum can be a NaN. XD
  if (idNum !== undefined) {
    return  `data.identifier === ${idNum}`;
  } else {
    throw new Error(`Identifier ${sheetItemID} is unparseable or invalid`);
  }
}

function predicate(query: string, mode: Predicate["mode"]): Predicate {
  return {
    __isPredicate: true,
    mode,
    predicate: query,
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
    },
  };
}


/** Indexes row data by first column (ID), groups by sheet. */
type CachedItems = Record<SheetName, Record<string, Record<string, string>>>;

// const CACHE_SHEETS = [Sheets.CITATIONS, Sheets.EXTENTS, Sheets.TRANSFORMATION_PARAMS] as const;
// TODO: cache ALL items, not just non-register items.
// Register items being added may reference other register items,
// not just non-items like extents/citations.
// TODO: Extents, citations will be their own items.
// /** Sheets with items to be cached but not converted to register items. */
// type NonItemSheetName = typeof CACHE_SHEETS[number];
// function isCachedSheet(val: string): val is NonItemSheetName {
//   return CACHE_SHEETS.indexOf(val as NonItemSheetName) >= 0;
// }

async function cacheItems(
  items: AsyncGenerator<ParsedSheetItem, void, undefined>,
) {
  const cache: Partial<CachedItems> = {};

  for await (const item of items) {
    cache[item.sheet] ??= {};
    cache[item.sheet]![item.rowRaw[0]] = item.rowParsed;
  }
  return cache;
}
