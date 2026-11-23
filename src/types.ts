/**
 * Cell kinds in a pattern mask:
 *  '0' = empty (outside the piece / cut-out such as a keyring hole)
 *  '1' = solid frame (plastic, not stitchable)
 *  '2' = stitchable hole / fabric cell
 */
export type CellKind = '0' | '1' | '2';

export interface ThreadColor {
  id: string;
  hex: string;
  name: string;
  brand: string;
  code: string;
  symbol: string;
}

export type StitchType = 'cross' | 'half' | 'tent' | 'fill';
export type BaseType = 'print3d' | 'aida' | 'plastic-canvas' | 'other';
/** which counted fabric a baseType 'aida' pattern is stitched on (lib/fabrics.ts) */
export type FabricKind = 'aida' | 'evenweave' | 'linen' | 'hardanger' | 'waste' | 'paper';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PatternDetails {
  description: string;
  author: string;
  tags: string[];
  difficulty: Difficulty;
  estHours: string;
  stitchType: StitchType;
  threadBrand: string;
  strands: number;
  needleType: string;
  needleSize: string;
  baseType: BaseType;
  /** fabric count: squares per inch (Aida-like) or threads per inch (evenweave, linen) */
  aidaCount: number;
  /** the counted fabric, when baseType is 'aida' */
  fabric: FabricKind;
  /** how many fabric threads one stitch crosses (evenweave/linen are usually stitched over 2) */
  over: 1 | 2;
  filament: string;
  filamentColor: string;
  thicknessMm: number;
  holeRatio: number;
  notes: string;
}

/** Stitching progress, kept per pattern (not included in share links). */
export interface Progress {
  /** one '0'/'1' char per cell: '1' = stitched */
  done: string;
  /** time recorded with the stitching timer */
  seconds: number;
  /** stitches marked per local day, 'YYYY-MM-DD' -> net count */
  daily: Record<string, number>;
  updatedAt: number;
}

export interface Pattern {
  id: string;
  version: 1;
  name: string;
  mode: 'free' | 'template';
  templateId?: string;
  templateName?: string;
  cols: number;
  rows: number;
  /** distance between hole/cell centres in mm */
  pitchMm: number;
  /** one CellKind char per cell, row-major */
  mask: string;
  /** palette index per cell, -1 = empty */
  cells: number[];
  palette: ThreadColor[];
  details: PatternDetails;
  createdAt: number;
  updatedAt: number;
  progress?: Progress;
  /** set when this pattern has been shared to the community gallery (posts.id) */
  postId?: string;
  /** set on a copy taken from the community gallery, so a re-share credits the original */
  remixOf?: { id: string; title: string; author: string };
  /** set on copies of the old built-in samples (removed from the home page; kept so those copies still read right) */
  sampleId?: string;
}

export type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'hole' | 'pan';
export type HoleBrush = '2' | '1' | '0';
export type ViewMode = 'stitch' | 'color' | 'symbol' | 'both';
