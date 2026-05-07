export interface DataVolleyZoneCoordinate {
  x: number;
  y: number;
}

export const DATA_VOLLEY_ZONE_COORDINATES: Record<string, DataVolleyZoneCoordinate> = {
  '4': { x: 18, y: 20 },
  '4a': { x: 18, y: 14 },
  '4b': { x: 18, y: 24 },
  '4c': { x: 18, y: 34 },
  '3': { x: 50, y: 20 },
  '3b': { x: 50, y: 24 },
  '3c': { x: 50, y: 34 },
  '2': { x: 82, y: 20 },
  '2a': { x: 82, y: 14 },
  '2b': { x: 82, y: 24 },
  '2c': { x: 82, y: 34 },
  '5a': { x: 18, y: 52 },
  '6': { x: 50, y: 58 },
  '7': { x: 18, y: 76 },
  '7a': { x: 18, y: 72 },
  '8': { x: 50, y: 82 },
  '6b': { x: 50, y: 74 },
  '9': { x: 82, y: 76 },
  '9a': { x: 82, y: 72 },
  '1a': { x: 82, y: 52 },

  // Setter support behind the right-back receiver in reception P1/S1.
  '9-support': { x: 88, y: 88 },
  '9-setter-support': { x: 88, y: 88 },
};

const DRAGGABLE_DATA_VOLLEY_ZONE_COORDINATES = Object.entries(DATA_VOLLEY_ZONE_COORDINATES)
  .filter(([zone]) => !zone.includes('support'));

export function getDataVolleyZoneCoordinate(zone: string): DataVolleyZoneCoordinate {
  return DATA_VOLLEY_ZONE_COORDINATES[zone] ?? { x: 50, y: 50 };
}

export function getNearestDataVolleyZone(x: number, y: number): string {
  return DRAGGABLE_DATA_VOLLEY_ZONE_COORDINATES.reduce(
    (nearest, [zone, coordinate]) => {
      const distance = ((coordinate.x - x) ** 2) + ((coordinate.y - y) ** 2);
      return distance < nearest.distance ? { zone, distance } : nearest;
    },
    { zone: '6b', distance: Number.POSITIVE_INFINITY },
  ).zone;
}
