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
    return isSharedPlaylistExpired({ expiresAt: report.expiresAt }, now);
}
/** An embedded picture of a page (the club logo): PNG or JPEG only. */
const EMBEDDED_IMAGE = /href="(data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+)"/g;
const IMAGE_REFERENCE = /href="ovs-image:(\d+)"/g;
/**
 * The club logo is drawn on every page: in the link it is written once, in `images`, and each
 * page points to it. Without this a report of 15 pages repeats it 15 times and outgrows the link.
 */
function hoistImages(pages: readonly string[]): { pages: string[]; images: string[] } {
    const images: string[] = [];
    const out = pages.map((page) => page.replace(EMBEDDED_IMAGE, (_, dataUrl: string) => {
        let index = images.indexOf(dataUrl);
        if (index < 0)
            index = images.push(dataUrl) - 1;
        return `href="ovs-image:${index}"`;
    }));
    return { pages: out, images };
}
const isEmbeddedImage = (value: unknown): value is string => typeof value === 'string' && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value);
export function encodeSharedReport(report: SharedTacticalReport): string {
    const hoisted = hoistImages(report.pages);
    const bytes = strToU8(JSON.stringify({ ...report, pages: hoisted.pages, ...(hoisted.images.length ? { images: hoisted.images } : {}) }));
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
        const value = JSON.parse(json) as SharedTacticalReport & { images?: unknown };
        if (!value || typeof value.title !== 'string' || value.title.length > 1000 || !Number.isFinite(value.expiresAt))
            return null;
        if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 100 || !value.pages.every((page) => typeof page === 'string' && /^<svg\b/.test(page)))
            return null;
        if (!Array.isArray(value.links) || value.links.length > 500 || !value.links.every((link) => link && typeof link.label === 'string' && typeof link.url === 'string' && /^https?:\/\//.test(link.url) && Number.isFinite(link.expiresAt)))
            return null;
        // Pictures written once in the link go back into the pages that point to them.
        const images = Array.isArray(value.images) && value.images.length <= 20 && value.images.every(isEmbeddedImage) ? value.images : [];
        const pages = value.pages.map((page) => page.replace(IMAGE_REFERENCE, (reference, index: string) => (images[Number(index)] ? `href="${images[Number(index)]}"` : reference)));
        return { title: value.title, pages, expiresAt: value.expiresAt, links: value.links };
    }
    catch {
        return null;
    }
}
export function buildSharedReportUrl(baseUrl: string, report: SharedTacticalReport): string {
    return `${baseUrl.replace(/[#?].*$/, '').replace(/\/+$/, '')}/#${SHARED_REPORT_ROUTE}/${encodeSharedReport(report)}`;
}
