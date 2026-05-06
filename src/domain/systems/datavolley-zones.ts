export interface DataVolleyZoneCoordinate {
  x: number;
  y: number;
}

export const DATA_VOLLEY_ZONE_COORDINATES: Record<string, DataVolleyZoneCoordinate> = {
  '4b': { x: 18, y: 24 },
  '3b': { x: 50, y: 24 },
  '2b': { x: 82, y: 24 },
  '7a': { x: 18, y: 72 },
  '6b': { x: 50, y: 74 },
  '9a': { x: 82, y: 72 },
};

export function getDataVolleyZoneCoordinate(zone: string): DataVolleyZoneCoordinate {
  return DATA_VOLLEY_ZONE_COORDINATES[zone] ?? { x: 50, y: 50 };
}

export function getNearestDataVolleyZone(x: number, y: number): string {
  return Object.entries(DATA_VOLLEY_ZONE_COORDINATES).reduce(
    (nearest, [zone, coordinate]) => {
      const distance = ((coordinate.x - x) ** 2) + ((coordinate.y - y) ** 2);
      return distance < nearest.distance ? { zone, distance } : nearest;
    },
    { zone: '6b', distance: Number.POSITIVE_INFINITY },
  ).zone;
}
