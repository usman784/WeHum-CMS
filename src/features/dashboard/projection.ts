/**
 * Latitude/longitude → a point on the world map in world-map.ts (Natural Earth projection, 960×470 box). The scale and
 * offsets were fitted against the country outlines (within one pixel), so city dots land on the right country.
 */
const SCALE = 175.478;
const X0 = 480;
const Y0 = 271;
export function project(lat: number, lng: number): [number, number] {
  const l = (lng * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  const p2 = p * p;
  const p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [X0 + SCALE * x, Y0 - SCALE * y];
}
