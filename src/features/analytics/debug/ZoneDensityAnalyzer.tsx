import { useMemo } from 'react';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { getZoneReferencePoint } from '@src/features/analytics/heatmaps/aggregation/zone-points';

/**
 * Zone-based density heatmap analyzer.
 * Reads zone codes from BallTouch.endZoneCode via rallyStats.touches
 * and maps them to geometric reference points.
 *
 * For each attack/receive:
 * - Reads endZoneCode (zone 1-9, optionally with subzone letter a-d)
 * - Uses geometric center of zone/subzone as reference point
 */
export function ZoneDensityAnalyzer({ stats }: { stats: MatchStats }) {
  const zoneData = useMemo(() => {
    const zoneMatrix: Record<string, number> = {};
    const zonePoints: Record<string, { x: number; y: number; count: number }> = {};

    let totalRallies = 0;
    let totalTouchesAllSkills = 0;
    let totalTouches = 0;
    let totalAttacks = 0;
    let attacksWithZoneCode = 0;
    let sampleTouches: any[] = [];

    // Read touches from rallyStats (where they're actually stored)
    for (const rally of stats.rallyStats) {
      totalRallies++;

      for (const touch of rally.touches) {
        totalTouchesAllSkills++;

        // Only include attacks and receives
        if (!['attack', 'receive'].includes(touch.skill)) continue;

        totalTouches++;
        if (touch.skill === 'attack') totalAttacks++;

        // Only process home team
        if (touch.teamSide !== 'home') continue;

        // Read zone code
        const endZoneCode = touch.endZoneCode;
        if (!endZoneCode) continue;

        attacksWithZoneCode++;

        // Parse zone code: "1", "2a", "3b", etc.
        const normalized = endZoneCode.trim().toLowerCase();
        const zoneNum = parseInt(normalized.charAt(0));
        const subzoneLetter = normalized.length > 1 ? (normalized.charAt(1) as 'a' | 'b' | 'c' | 'd') : undefined;

        if (isNaN(zoneNum) || zoneNum < 1 || zoneNum > 9) continue;

        // Aggregate by zone and subzone
        if (subzoneLetter && /^[a-d]$/.test(subzoneLetter)) {
          const subzone = subzoneLetter.toUpperCase() as 'A' | 'B' | 'C' | 'D';
          const key = `${zoneNum}${subzone}`;
          zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
        } else {
          const key = `${zoneNum}`;
          zoneMatrix[key] = (zoneMatrix[key] || 0) + 1;
        }

        // Get geometric reference point
        const subzone = subzoneLetter && /^[a-d]$/.test(subzoneLetter)
          ? (subzoneLetter.toUpperCase() as 'A' | 'B' | 'C' | 'D')
          : undefined;
        const refPoint = getZoneReferencePoint(endZoneCode, subzone, 'left');

        if (refPoint) {
          const pointKey = `${refPoint.x.toFixed(1)},${refPoint.y.toFixed(1)}`;
          if (!zonePoints[pointKey]) {
            zonePoints[pointKey] = { x: refPoint.x, y: refPoint.y, count: 0 };
          }
          zonePoints[pointKey].count++;
        }
      }
    }

    return { zoneMatrix, zonePoints, totalAttacks, attacksWithZoneCode, totalTouches, sampleTouches, totalRallies, totalTouchesAllSkills };
  }, [stats]);

  const zoneLayout = [
    ['Zone 4', 'Zone 3', 'Zone 2'],
    ['Zone 9', 'Zone 8', 'Zone 7'],
    ['Zone 5', 'Zone 6', 'Zone 1'],
  ];

  const maxCount = Math.max(1, Math.max(...Object.values(zoneData.zoneMatrix), 1));

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
      <h3>Zone Density Analysis - Home Team (Attacks + Receives)</h3>
      <p>
        Rallies: {zoneData.totalRallies} | All touches: {zoneData.totalTouchesAllSkills} | Attacks+Receives: {zoneData.totalTouches} | With zone code: {zoneData.attacksWithZoneCode}
      </p>

      {/* Debug: Show detailed stats and sample touches */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
        <strong style={{ color: '#856404' }}>🔍 Debug Info (reading from rallyStats):</strong>
        <div style={{ fontSize: '11px', marginTop: '8px', color: '#856404' }}>
          <div>Total rallies: {zoneData.totalRallies}</div>
          <div>Total touches (all skills): {zoneData.totalTouchesAllSkills}</div>
          <div>Touches with attack/receive skill: {zoneData.totalTouches}</div>
          <div>Home team with zone code: {zoneData.attacksWithZoneCode}</div>
        </div>

        {zoneData.sampleTouches.length > 0 && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #ffc107' }}>
            <strong>Sample touches structure:</strong>
            <pre style={{ fontSize: '9px', overflow: 'auto', maxHeight: '200px', backgroundColor: 'rgba(255,255,255,0.5)', padding: '8px', marginTop: '4px' }}>
              {JSON.stringify(zoneData.sampleTouches, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Main zone grid */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '10px' }}>3×3 Zone Layout (DataVolley zones 1-9):</h4>
        <table style={{ borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tbody>
            {zoneLayout.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((zoneName, colIdx) => {
                  const zoneNum = parseInt(zoneName.split(' ')[1]);
                  const zoneAttacks = ['A', 'B', 'C', 'D'].reduce(
                    (sum, sz) => sum + (zoneData.zoneMatrix[`${zoneNum}${sz}`] || 0),
                    0
                  ) + (zoneData.zoneMatrix[`${zoneNum}`] || 0);

                  const density = zoneAttacks / maxCount;

                  return (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      style={{
                        border: '2px solid #333',
                        padding: '12px',
                        textAlign: 'center',
                        width: '140px',
                        backgroundColor: zoneAttacks > 0
                          ? density < 0.5
                            ? `rgb(${Math.round(59 + (density * 2) * (253 - 59))}, ${Math.round(130 + (density * 2) * (224 - 130))}, ${Math.round(246 - (density * 2) * 246)})`
                            : `rgb(${Math.round(253 - ((density - 0.5) * 2) * (253 - 220))}, ${Math.round(224 - ((density - 0.5) * 2) * (224 - 38))}, 0)`
                          : '#f5f5f5',
                        color: density > 0.6 ? 'white' : 'black',
                        fontWeight: 'bold',
                      }}
                    >
                      <div>{zoneName}</div>
                      <div style={{ fontSize: '16px', marginTop: '4px' }}>{zoneAttacks}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Zone + Sub-zone Grid (6×4 layout) */}
      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ marginBottom: '10px' }}>Matrice Sub-zone (36 celle: 9 zone × 4 sub-zone):</h4>
        <table style={{ borderCollapse: 'collapse', marginBottom: '20px' }}>
          <tbody>
            {/* Row 1: Zone 4 and 3 and 2 (each 2x2 for sub-zones) */}
            {[
              [
                { zone: 4, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 3, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 2, subzones: ['C', 'B', 'D', 'A'] },
              ],
              [
                { zone: 9, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 8, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 7, subzones: ['C', 'B', 'D', 'A'] },
              ],
              [
                { zone: 5, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 6, subzones: ['C', 'B', 'D', 'A'] },
                { zone: 1, subzones: ['C', 'B', 'D', 'A'] },
              ],
            ].map((zoneRow, rowIdx) => (
              <tr key={`row-${rowIdx}`}>
                {zoneRow.map((zoneGroup, zoneIdx) => (
                  <td
                    key={`zone-${zoneGroup.zone}`}
                    style={{ padding: 0, border: '2px solid #333' }}
                  >
                    <table style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                        {[
                          [zoneGroup.subzones[0], zoneGroup.subzones[1]],
                          [zoneGroup.subzones[2], zoneGroup.subzones[3]],
                        ].map((subzoneRow, subRowIdx) => (
                          <tr key={`sub-${subRowIdx}`}>
                            {subzoneRow.map((subzone) => {
                              const count = zoneData.zoneMatrix[`${zoneGroup.zone}${subzone}`] || 0;
                              const density = count / maxCount;
                              const bgColor = count > 0
                                ? density < 0.5
                                  ? `rgb(${Math.round(59 + (density * 2) * (253 - 59))}, ${Math.round(130 + (density * 2) * (224 - 130))}, ${Math.round(246 - (density * 2) * 246)})`
                                  : `rgb(${Math.round(253 - ((density - 0.5) * 2) * (253 - 220))}, ${Math.round(224 - ((density - 0.5) * 2) * (224 - 38))}, 0)`
                                : '#f5f5f5';

                              return (
                                <td
                                  key={`${zoneGroup.zone}${subzone}`}
                                  style={{
                                    border: '1px solid #666',
                                    padding: '6px',
                                    width: '50px',
                                    height: '50px',
                                    textAlign: 'center',
                                    backgroundColor: bgColor,
                                    color: density > 0.6 ? 'white' : 'black',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  <div>{zoneGroup.zone}{subzone.toLowerCase()}</div>
                                  <div style={{ fontSize: '14px', marginTop: '2px' }}>{count}</div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px', fontSize: '11px' }}>
        <strong>How it works:</strong><br />
        • Each attack is mapped to its zone end code (1-9)<br />
        • If sub-zone data available (from cone conversion): uses sub-zone geometric point<br />
        • Otherwise: uses main zone geometric center<br />
        • Color gradient (blue→yellow→red) shows attack density per zone<br />
        • Layout: [4,3,2] near net | [9,8,7] mid | [5,6,1] far end
      </div>
    </div>
  );
}
