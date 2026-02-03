// src/app/lib/units.ts

export type UnitOption = { label: string; scale: number }; // scale to base unit

export const FREQ_UNITS: UnitOption[] = [
  { label: "Hz", scale: 1 },
  { label: "kHz", scale: 1e3 },
  { label: "MHz", scale: 1e6 },
  { label: "GHz", scale: 1e9 },
];

export const CAP_UNITS: UnitOption[] = [
  { label: "F", scale: 1 },
  { label: "mF", scale: 1e-3 },
  { label: "µF", scale: 1e-6 },
  { label: "nF", scale: 1e-9 },
  { label: "pF", scale: 1e-12 },
];

export const IND_UNITS: UnitOption[] = [
  { label: "H", scale: 1 },
  { label: "mH", scale: 1e-3 },
  { label: "µH", scale: 1e-6 },
  { label: "nH", scale: 1e-9 },
];

export const RES_UNITS: UnitOption[] = [
  { label: "mΩ", scale: 1e-3 },
  { label: "Ω", scale: 1 },
  { label: "kΩ", scale: 1e3 },
  { label: "MΩ", scale: 1e6 },
];

export function parseNumberLoose(s: string): number | null {
  const v = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export function toBase(valueStr: string, unitLabel: string, units: UnitOption[]): number | null {
  const v = parseNumberLoose(valueStr);
  if (v === null) return null;
  const u = units.find((x) => x.label === unitLabel);
  if (!u) return null;
  return v * u.scale;
}
