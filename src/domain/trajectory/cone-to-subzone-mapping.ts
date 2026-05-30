/**
 * Mapping da CONI DataVolley a SOTTOZONE per normalizzazione heatmap granulare.
 *
 * In DataVolley, il sistema dei coni è esclusivo rispetto alle sottozone.
 * Per ottenere una heatmap consistente con granularità di sottozone,
 * convertiamo i coni alle sottozone equivalenti basandoci sui diagrammi
 * del manuale DataVolley (pag. 56).
 */

/**
 * Mappa un cono a una sottozona target.
 *
 * Sono supportati due modi di calling:
 * 1. coneToSubzone(attackingPosition, coneNumber)
 *    - Mappatura precisa basata sulla posizione di attacco specifica
 * 2. coneToSubzone(coneNumber) con solo 1 parametro
 *    - Mappatura approssimativa senza conoscenza della posizione di attacco
 *    - Usa un'euristica basata sul numero del cono
 *
 * @param positionOrCone - Posizione di attacco ('4', '5', '3', '6', '2', '1') o numero cono
 * @param coneNumber - Numero cono (opzionale se primo param è il cono)
 * @returns { zoneId: string, subzone: 'A' | 'B' | 'C' | 'D' } o null se non mappabile
 */
export function coneToSubzone(
  positionOrCone: string | number,
  coneNumber?: string | number,
): { zoneId: string; subzone: 'A' | 'B' | 'C' | 'D' } | null {
  // Se coneNumber non è fornito, assumiamo che positionOrCone sia il cono stesso
  if (coneNumber === undefined) {
    return mapConeWithoutPosition(String(positionOrCone).trim().toUpperCase());
  }

  // Altrimenti, positionOrCone è la posizione di attacco
  const pos = String(positionOrCone).trim();
  const cone = String(coneNumber).trim().toUpperCase();

  // Attacchi da posizione 4 o 5 (settore sinistro della rete)
  if (pos === '4' || pos === '5') {
    return mapConeFromLeftSector(cone);
  }

  // Attacchi da posizione 2 o 1 (settore destro della rete)
  if (pos === '2' || pos === '1') {
    return mapConeFromRightSector(cone);
  }

  // Attacchi da posizione 3 o 6 (centro)
  if (pos === '3' || pos === '6') {
    return mapConeFromCenter(cone);
  }

  // Posizione sconosciuta
  return null;
}

/**
 * Mappa un cono a una sottozona senza conoscenza della posizione di attacco.
 * Usa un'euristica semplice basata sul numero del cono per fornire una mappatura approssimativa.
 * Questa funzione è utile per DataVolley imports quando il court position non è disponibile.
 *
 * Euristica: assume una distribuzione uniforme dei coni sui settori della corte.
 */
function mapConeWithoutPosition(cone: string): {
  zoneId: string;
  subzone: 'A' | 'B' | 'C' | 'D';
} | null {
  // Mapping generico basato sulla distribuzione approssimativa dei coni
  // Questo è un fallback quando non conosciamo la posizione di attacco
  const genericConeMap: Record<string, { zoneId: string; subzone: 'A' | 'B' | 'C' | 'D' }> = {
    // Settore sinistro (1-3 in settori laterali)
    '1': { zoneId: '5', subzone: 'A' },  // Fondocampo sinistro
    '2': { zoneId: '4', subzone: 'A' },  // Rete sinistra
    '3': { zoneId: '6', subzone: 'A' },  // Centro fondocampo

    // Centro (4-6)
    '4': { zoneId: '8', subzone: 'B' },  // Centro fondocampo (alto)
    '5': { zoneId: '9', subzone: 'B' },  // Centro-destra

    // Settore destro (6-9)
    '6': { zoneId: '3', subzone: 'A' },  // Centro
    '7': { zoneId: '2', subzone: 'A' },  // Rete destra
    '8': { zoneId: '1', subzone: 'A' },  // Fondocampo destro
    '9': { zoneId: '1', subzone: 'D' },  // Fondocampo destro (basso)

    // Zero (raro, centro)
    '0': { zoneId: '6', subzone: 'B' },  // Centro fondocampo
  };

  return genericConeMap[cone] ?? null;
}

/**
 * Mappa coni dal settore sinistro (posizioni 4/5) a sottozone.
 * Basato su diagramma DataVolley pag. 56 "da posto 4/5"
 */
function mapConeFromLeftSector(cone: string): {
  zoneId: string;
  subzone: 'A' | 'B' | 'C' | 'D';
} | null {
  const coneMap: Record<string, { zoneId: string; subzone: 'A' | 'B' | 'C' | 'D' }> = {
    // Coni verso sinistra (zona 5 - fondocampo sinistro)
    '1': { zoneId: '5', subzone: 'A' },
    '2': { zoneId: '5', subzone: 'D' },

    // Cono verso centro-sinistra (zona 6 - centro fondocampo)
    '3': { zoneId: '6', subzone: 'A' },

    // Cono verso centro (zona 8 - centro fondocampo superiore)
    '4': { zoneId: '8', subzone: 'B' },

    // Cono verso centro-destra (zona 9 - fondocampo destro)
    '5': { zoneId: '9', subzone: 'D' },

    // Coni verso destra (zona 2 - rete destra)
    '6': { zoneId: '2', subzone: 'C' },
    '7': { zoneId: '2', subzone: 'A' },
  };

  return coneMap[cone] ?? null;
}

/**
 * Mappa coni dal settore destro (posizioni 2/1) a sottozone.
 * Basato su diagramma DataVolley pag. 56 "da posto 2/1" (simmetrico inverso)
 */
function mapConeFromRightSector(cone: string): {
  zoneId: string;
  subzone: 'A' | 'B' | 'C' | 'D';
} | null {
  const coneMap: Record<string, { zoneId: string; subzone: 'A' | 'B' | 'C' | 'D' }> = {
    // Coni verso destra (zona 1 - fondocampo destro)
    '1': { zoneId: '1', subzone: 'D' },
    '2': { zoneId: '1', subzone: 'A' },

    // Cono verso centro-destra (zona 6 - centro fondocampo)
    '3': { zoneId: '6', subzone: 'D' },

    // Cono verso centro (zona 8 - centro fondocampo superiore)
    '4': { zoneId: '8', subzone: 'B' },

    // Cono verso centro-sinistra (zona 9 - fondocampo sinistro)
    '5': { zoneId: '9', subzone: 'A' },

    // Coni verso sinistra (zona 4 - rete sinistra)
    '6': { zoneId: '4', subzone: 'C' },
    '7': { zoneId: '4', subzone: 'A' },

    // Coni verso fondocampo sinistro
    '8': { zoneId: '7', subzone: 'D' },
    '9': { zoneId: '5', subzone: 'C' },

    // Cono zero (raro, fondocampo)
    '0': { zoneId: '6', subzone: 'C' },
  };

  return coneMap[cone] ?? null;
}

/**
 * Mappa coni dal centro (posizioni 3/6) a sottozone.
 * Basato su diagramma DataVolley pag. 56 "dal centro"
 * Il centro ha nomi specifici: Center, Front 3, Front 8, Back 3, Pipe, Setter, Back 8
 */
function mapConeFromCenter(cone: string): {
  zoneId: string;
  subzone: 'A' | 'B' | 'C' | 'D';
} | null {
  const coneMap: Record<string, { zoneId: string; subzone: 'A' | 'B' | 'C' | 'D' }> = {
    // Numerici per backward compatibility
    '1': { zoneId: '2', subzone: 'B' }, // Front 3 area
    '2': { zoneId: '8', subzone: 'B' }, // Front 8 area
    '3': { zoneId: '3', subzone: 'B' }, // Center area
    '4': { zoneId: '4', subzone: 'B' }, // Pipe/Center-left area
    '5': { zoneId: '9', subzone: 'B' }, // Back 3 area
    '6': { zoneId: '8', subzone: 'D' }, // Back 8 area
    '7': { zoneId: '7', subzone: 'B' }, // Back area left
    '8': { zoneId: '9', subzone: 'C' }, // Back area right
    '9': { zoneId: '6', subzone: 'C' }, // Setter area

    // Named variants per centro (se codificati così)
    'FRONT3': { zoneId: '2', subzone: 'B' },
    'FRONT8': { zoneId: '8', subzone: 'B' },
    'CENTER': { zoneId: '3', subzone: 'B' },
    'PIPE': { zoneId: '4', subzone: 'B' },
    'BACK3': { zoneId: '9', subzone: 'B' },
    'BACK8': { zoneId: '7', subzone: 'B' },
    'SETTER': { zoneId: '6', subzone: 'C' },
  };

  return coneMap[cone] ?? null;
}

/**
 * Valida se una posizione di attacco è riconosciuta
 */
export function isValidAttackingPosition(position: string): boolean {
  const validPositions = ['1', '2', '3', '4', '5', '6'];
  return validPositions.includes(String(position).trim());
}

/**
 * Valida se un numero cono è valido per una data posizione
 */
export function isValidConeNumber(position: string, cone: string | number): boolean {
  const pos = String(position).trim();
  const coneStr = String(cone).trim().toUpperCase();

  if (pos === '4' || pos === '5') {
    return /^[1-7]$/.test(coneStr);
  }
  if (pos === '2' || pos === '1') {
    return /^[0-9]$/.test(coneStr);
  }
  if (pos === '3' || pos === '6') {
    return /^([1-9]|FRONT3|FRONT8|CENTER|PIPE|BACK3|BACK8|SETTER)$/.test(coneStr);
  }

  return false;
}
