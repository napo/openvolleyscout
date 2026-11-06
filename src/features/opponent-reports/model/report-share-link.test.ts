import { describe, expect, it } from 'vitest';
import { encodeSharedReport, decodeSharedReport, isSharedReportExpired, buildSharedReportUrl, type SharedTacticalReport } from './report-share-link';
const report: SharedTacticalReport = { title: 'P1 <11> 日本語', pages: ['<svg xmlns="http://www.w3.org/2000/svg"><text>Serve</text></svg>'], links: [{ label: 'Reception', url: 'https://example.org/#/player/1.test', expiresAt: 5000 }], expiresAt: 10000 };
describe('shared tactical report snapshots', () => {
  it('round-trips standalone pages, optional video links, Unicode and expiry', () => {
    expect(decodeSharedReport(encodeSharedReport(report))).toEqual(report);
    expect(buildSharedReportUrl('https://example.org/ovs/#/old', report)).toContain('https://example.org/ovs/#/tactical-report/1.');
    expect(isSharedReportExpired(report, 9999)).toBe(false);
    expect(isSharedReportExpired(report, 10001)).toBe(true);
  });
  it('rejects malformed, future, empty and oversized links', () => {
    expect(decodeSharedReport('2.abcd')).toBeNull();
    expect(decodeSharedReport('1.abcd')).toBeNull();
    expect(decodeSharedReport(encodeSharedReport({ ...report, pages: [] }))).toBeNull();
    expect(() => encodeSharedReport({ ...report, pages: ['<svg>' + 'x'.repeat(2_000_000) + '</svg>'] })).toThrow();
  });
  it('rejects script links and non-SVG documents', () => {
    expect(decodeSharedReport(encodeSharedReport({ ...report, links: [{ label: 'bad', url: 'javascript:alert(1)', expiresAt: 1 }] }))).toBeNull();
    expect(decodeSharedReport(encodeSharedReport({ ...report, pages: ['<script>alert(1)</script>'] }))).toBeNull();
  });
});
