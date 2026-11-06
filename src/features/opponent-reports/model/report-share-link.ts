import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { bytesToBase64Url, base64UrlToBytes, isSharedPlaylistExpired } from '@src/features/analysis/video/youtube-share-link';
export interface SharedTacticalReport {
    title: string;
    pages: string[];
    expiresAt: number;
    links: Array<{
        label: string;
        url: string;
        expiresAt: number;
    }>;
}
const MAX_BYTES = 2000000;
const MAX_LINK_LENGTH = 180000;
export const SHARED_REPORT_ROUTE = '/tactical-report';
/** Like video links, expiry is enforced by the reader, not server-side access control. */
export function isSharedReportExpired(report: SharedTacticalReport, now = Date.now()): boolean {
    return isSharedPlaylistExpired({ title: report.title, subtitle: '', clips: [], expiresAt: report.expiresAt }, now);
}
export function encodeSharedReport(report: SharedTacticalReport): string {
    const bytes = strToU8(JSON.stringify(report));
    if (bytes.length > MAX_BYTES)
        throw new Error('Tactical report exceeds sharing size limit');
    const payload = `1.${bytesToBase64Url(deflateSync(bytes, { level: 9 }))}`;
    if (payload.length > MAX_LINK_LENGTH)
        throw new Error('Tactical report link exceeds sharing size limit');
    return payload;
}
export function decodeSharedReport(payload: string): SharedTacticalReport | null {
    if (payload.length > MAX_LINK_LENGTH || !/^1\.[\w-]+$/.test(payload))
        return null;
    try {
        // A fixed output buffer bounds decompression of untrusted link contents.
        const bytes = inflateSync(base64UrlToBytes(payload.slice(2)), { out: new Uint8Array(MAX_BYTES + 1) });
        const json = strFromU8(bytes).replace(/\0+$/, '');
        if (strToU8(json).length > MAX_BYTES)
            return null;
        const value = JSON.parse(json) as SharedTacticalReport;
        if (!value || typeof value.title !== 'string' || value.title.length > 1000 || !Number.isFinite(value.expiresAt))
            return null;
        if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 100 || !value.pages.every((page) => typeof page === 'string' && /^<svg\b/.test(page)))
            return null;
        if (!Array.isArray(value.links) || value.links.length > 500 || !value.links.every((link) => link && typeof link.label === 'string' && typeof link.url === 'string' && /^https?:\/\//.test(link.url) && Number.isFinite(link.expiresAt)))
            return null;
        return { title: value.title, pages: value.pages, expiresAt: value.expiresAt, links: value.links };
    }
    catch {
        return null;
    }
}
export function buildSharedReportUrl(baseUrl: string, report: SharedTacticalReport): string {
    return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/#${SHARED_REPORT_ROUTE}/${encodeSharedReport(report)}`;
}
