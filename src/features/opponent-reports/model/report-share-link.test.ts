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
  it('writes the club logo once even when every page shows it, and puts it back in each page', () => {
    // A logo of about 30 000 characters on 15 pages would outgrow the link if repeated.
    const logo = `data:image/png;base64,${Array.from({ length: 30_000 }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[(i * 7919) % 64]).join('')}`;
    const page = (n: number) => `<svg xmlns="http://www.w3.org/2000/svg"><image href="${logo}" x="1" y="1" width="52" height="52"/><text>Page ${n}</text></svg>`;
    const withLogo = { ...report, pages: Array.from({ length: 15 }, (_, i) => page(i + 1)) };
    const payload = encodeSharedReport(withLogo);
    expect(payload.length).toBeLessThan(60_000);
    expect(decodeSharedReport(payload)).toEqual(withLogo);
  });
  it('drops a picture of the link that is not a PNG or JPEG', () => {
    const page = '<svg xmlns="http://www.w3.org/2000/svg"><image href="ovs-image:0"/></svg>';
    const decoded = decodeSharedReport(encodeSharedReport({ ...report, pages: [page] }));
    expect(decoded?.pages[0]).toBe(page);
  });
});
