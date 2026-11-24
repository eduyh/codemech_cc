import { STARTER_MECHS } from './presets';

export interface SampleMechExportEntry {
  id: string;
  name: string;
  fileNumber?: number;
  data: Record<string, unknown>;
}

/**
 * Sample mech entries exported into `mechs_sample/` during `npm run package`.
 */
export const SAMPLE_MECHS: SampleMechExportEntry[] = STARTER_MECHS.map((bp, idx) => ({
  id: bp.id,
  name: bp.name,
  fileNumber: idx + 1,
  data: bp as unknown as Record<string, unknown>,
}));
