function normalizeTeamName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeSegment(value: string, fallback: string): string {
  const cleaned = value.replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, 3).padEnd(3, fallback);
}

export function buildTeamCodePrefix(teamName: string): string {
  const normalizedName = normalizeTeamName(teamName);
  const words = normalizedName.split(' ').filter(Boolean);

  if (words.length >= 2) {
    return `${normalizeSegment(words[0], 'X')}-${normalizeSegment(words[1], 'X')}`;
  }

  const compactName = normalizedName.replace(/\s+/g, '');
  if (compactName.length >= 6) {
    return `${normalizeSegment(compactName.slice(0, 3), 'X')}-${normalizeSegment(compactName.slice(3, 6), 'X')}`;
  }

  return `${normalizeSegment(compactName.slice(0, 3), 'X')}-${normalizeSegment(compactName.slice(3), 'X')}`;
}

function buildTeamCodeSuffix(teamId: string, suffixLength: number): string {
  const compactId = teamId.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const safeLength = Math.max(4, suffixLength);
  return compactId.slice(-safeLength).padStart(safeLength, '0');
}

export function generateTeamCode(teamName: string, teamId: string, suffixLength = 4): string {
  return `${buildTeamCodePrefix(teamName)}-${buildTeamCodeSuffix(teamId, suffixLength)}`;
}
