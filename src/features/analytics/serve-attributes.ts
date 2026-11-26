// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a serve says about itself: where it started (DataVolley serve start zone), how it was
 * served (type) and where it went (target / reception zone). One place for the side-out study
 * and the tactical reports, so both read the same data the same way.
 *
 * Runs under ts-node too: relative and type-only imports only.
 */
import type { BallTouch } from '../../domain/touch/types';
import { hasPlaceholderZones } from '../../domain/touch/types';
import type { SetterDistributionServeType } from '../../domain/opponent-report/types';

/** The five DataVolley serve start zones, in the order the manual lists them (13.2). */
export const SERVE_START_ZONES = ['1', '9', '6', '7', '5'] as const;
/** Reception / serve arrival zones: deep 1/6/5, intermediate 9/8/7, short 2/3/4. */
export const SERVE_TARGET_ZONES = ['1', '6', '5', '9', '8', '7', '2', '3', '4'] as const;
export const SERVE_TYPE_GROUPS: readonly SetterDistributionServeType[] = ['jump_spin', 'jump_float', 'float', 'other'];

const zoneDigit = (value: unknown): string | null => {
  const digit = typeof value === 'string' ? value.trim().charAt(0) : '';
  return /^[1-9]$/.test(digit) ? digit : null;
};

/** DataVolley zone (1-9) where a reception happened: the reception's end zone, else the serve's. */
export function receptionZone(receive: BallTouch, serve: BallTouch | undefined): string | null {
  const pick = (touch: BallTouch | undefined) => zoneDigit(touch?.endZoneCode ?? touch?.advancedDetails?.serve?.targetZone);
  return pick(receive) ?? pick(serve);
}

/** Zone (1-9) the serve started from. */
export function serveStartZone(serve: BallTouch): string | null {
  // Button input has only a placeholder serve zone (always the position-1 lane).
  if (hasPlaceholderZones(serve)) return null;
  return zoneDigit(
    serve.startZoneCode
      ?? serve.advancedDetails?.serve?.startZone
      ?? (serve.originZone?.zoneId !== undefined ? String(serve.originZone.zoneId) : undefined)
      ?? (serve.zone?.zoneId !== undefined ? String(serve.zone.zoneId) : undefined),
  );
}

/** Zone (1-9) the serve went to: where it was received, else the serve's own end zone. */
export function serveTargetZone(serve: BallTouch, receive?: BallTouch): string | null {
  if (receive) {
    const fromReceive = receptionZone(receive, serve);
    if (fromReceive) return fromReceive;
  }
  if (hasPlaceholderZones(serve)) return null;
  return zoneDigit(
    serve.endZoneCode
      ?? serve.advancedDetails?.serve?.targetZone
      ?? (serve.targetZone?.zoneId !== undefined ? String(serve.targetZone.zoneId) : undefined)
      ?? (serve.direction?.end?.zoneId !== undefined ? String(serve.direction.end.zoneId) : undefined),
  );
}

/** Serve type as recorded: an explicit type from Tags, else the DataVolley code (Q/T spin, M jump float, H/O float). */
export function serveTypeValue(serve: BallTouch, receive?: BallTouch): string | null {
  const explicit = serve.advancedDetails?.serve?.type;
  if (explicit) {
    return explicit === 'standing_float' ? 'float' : explicit;
  }
  const code = (serve.serveType ?? serve.skillTypeCode ?? receive?.skillTypeCode)?.trim().toUpperCase();
  if (!code) return null;
  if (code === 'Q' || code === 'T') return 'jump_spin';
  if (code === 'M') return 'jump_float';
  if (code === 'H' || code === 'O') return 'float';
  return code.toLowerCase();
}

/** The four serve type groups used by the filters; anything unknown is 'other'. */
export function serveTypeGroup(serve: BallTouch, receive?: BallTouch): SetterDistributionServeType {
  const raw = serveTypeValue(serve, receive);
  return raw === 'jump_spin' || raw === 'jump_float' || raw === 'float' ? raw : 'other';
}
