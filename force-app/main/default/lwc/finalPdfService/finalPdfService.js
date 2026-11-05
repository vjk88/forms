/**
 * finalPdfService — builds a branded PDF in the browser and hands it to the
 * person as a file (IMPL_PLAN_FORM_PDF §4.6).
 *
 * The one entry point every surface calls: the respondent's copy after
 * submit (c/finalFormViewer), a stored submission (c/finalSubmissionReader)
 * and the Studio's blank form (c/finalPreviewStage). Each surface builds the
 * document model itself (c/finalPdfModel) and says where image bytes come
 * from (`loadImages`); everything else happens here:
 *
 *   1. load pdf-lib + fontkit from the `formPdf` resource, on first use only
 *      (1.3 MB nobody downloads until they ask for a PDF);
 *   2. turn the form's tokens into PDF colors and fonts (c/finalPdfTheme);
 *   3. fetch the brand fonts as TrueType from `formPdfFonts` (same origin);
 *   4. fetch the images through `loadImages` (Salesforce Files live on
 *      another domain, so the browser cannot read their bytes itself);
 *   5. draw (c/finalPdfWriter) and save.
 *
 * A font or image that fails to load is left out (Helvetica stands in for a
 * font); only a failure to load the library or to draw fails the download.
 */
import { loadScript } from 'lightning/platformResourceLoader';
import PDF_LIBS from '@salesforce/resourceUrl/formPdf';
import PDF_FONTS from '@salesforce/resourceUrl/formPdfFonts';
import LOCALE from '@salesforce/i18n/locale';
import { pdfTheme, pdfFontFiles } from 'c/finalPdfTheme';
import { renderPdf } from 'c/finalPdfWriter';

/** Countries that print on US Letter; everyone else gets A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE']);

export const PDF_FAILED =
    'The PDF could not be made. Check your connection and try again.';

let libsPromise = null;

/** pdf-lib + fontkit, loaded once per page. */
function loadLibs(component) {
    if (!libsPromise) {
        libsPromise = Promise.all([
            loadScript(component, `${PDF_LIBS}/pdf-lib.min.js`),
            loadScript(component, `${PDF_LIBS}/fontkit.umd.min.js`)
        ])
            .then(() => {
                const lib = window.PDFLib;
                const fontkit = window.fontkit;
                if (!lib) {
                    throw new Error('pdf-lib did not load');
                }
                return { lib, fontkit };
            })
            .catch((e) => {
                libsPromise = null; // let the next click try again
                throw e;
            });
    }
    return libsPromise;
}

/** Test seam: forget the loaded libraries. */
export function resetForTests() {
    libsPromise = null;
}

export function pageSizeFor(locale) {
    const region = String(locale || '').split(/[-_]/)[1];
    return region && LETTER_REGIONS.has(region.toUpperCase()) ? 'Letter' : 'A4';
}

async function fetchBytes(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
        throw new Error(`${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
}

async function familyBytes(key) {
    const files = pdfFontFiles(key);
    if (!files) return null;
    try {
        const [regular, bold] = await Promise.all([
            fetchBytes(`${PDF_FONTS}/${files.regular}`),
            files.bold === files.regular
                ? null
                : fetchBytes(`${PDF_FONTS}/${files.bold}`)
        ]);
        return { regular, bold: bold || regular };
    } catch {
        return null;
    }
}

async function loadFonts(theme) {
    const [body, display] = await Promise.all([
        familyBytes(theme.fonts.body.key),
        theme.fonts.display.key === theme.fonts.body.key
            ? null
            : familyBytes(theme.fonts.display.key)
    ]);
    if (!body) return null;
    return { body, display: display || body };
}

/**
 * Noto Sans fallbacks (formPdfFonts/fallback) and the letters each covers.
 * Tried in this order for a letter the brand font lacks; one is downloaded
 * only when the document contains a letter in its ranges.
 */
const FALLBACKS = [
    { key: 'latin-ext', re: /[\u0100-\u024f\u1e00-\u1eff]/u },
    {
        key: 'vietnamese',
        re: /[\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01a0\u01a1\u01af\u01b0\u1ea0-\u1ef9]/u
    },
    {
        key: 'cyrillic',
        re: /[\u0400-\u052f\u1c80-\u1c8f\ua640-\ua69f]/u
    },
    { key: 'greek', re: /[\u0370-\u03ff\u1f00-\u1fff]/u }
];

/** The fallback alphabets a document needs, in try order. */
export function fallbackSubsetsFor(doc) {
    const text = JSON.stringify(doc || {});
    return FALLBACKS.filter((f) => f.re.test(text)).map((f) => f.key);
}

async function loadFallbacks(doc) {
    const subsets = fallbackSubsetsFor(doc);
    const list = await Promise.all(
        subsets.map(async (key) => {
            try {
                const [regular, bold] = await Promise.all([
                    fetchBytes(`${PDF_FONTS}/fallback/NotoSans-${key}-400.ttf`),
                    fetchBytes(`${PDF_FONTS}/fallback/NotoSans-${key}-700.ttf`)
                ]);
                return { regular, bold };
            } catch {
                return null;
            }
        })
    );
    return list.filter(Boolean);
}

/** Every image the document draws: [{ url, versionId }]. */
export function imageRefs(doc) {
    const refs = [];
    const add = (ref) => {
        if (ref && ref.url) {
            refs.push({
                url: ref.url,
                versionId: ref.versionId || ref.contentVersionId || null
            });
        }
    };
    add(doc.logo);
    add(doc.banner);
    for (const b of doc.blocks || []) {
        if (b.kind === 'image') add(b);
    }
    return refs;
}

function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/** WebP / GIF → PNG through a canvas (PDF only carries PNG and JPEG). */
function toPng(mimeType, b64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                const url = canvas.toDataURL('image/png');
                resolve(base64ToBytes(url.slice(url.indexOf(',') + 1)));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = `data:${mimeType};base64,${b64}`;
    });
}

async function imageEntry(mimeType, b64) {
    if (mimeType === 'image/png')
        return { bytes: base64ToBytes(b64), type: 'png' };
    if (mimeType === 'image/jpeg')
        return { bytes: base64ToBytes(b64), type: 'jpg' };
    const png = await toPng(mimeType, b64);
    return png ? { bytes: png, type: 'png' } : null;
}

function typeFromUrl(url) {
    const u = String(url).toLowerCase().split('?')[0];
    if (u.endsWith('.png')) return 'image/png';
    if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg';
    return null;
}

async function loadImages(doc, loader) {
    const refs = imageRefs(doc);
    const images = {};
    if (!refs.length) return images;
    const ids = [...new Set(refs.map((r) => r.versionId).filter(Boolean))];
    const byId = {};
    if (ids.length && loader) {
        try {
            const res = await loader(ids);
            for (const img of (res && res.images) || []) {
                byId[img.id] = img;
                byId[String(img.id).slice(0, 15)] = img;
            }
        } catch {
            // images are a courtesy: the PDF is still built without them
        }
    }
    for (const ref of refs) {
        if (images[ref.url]) continue;
        const hit =
            ref.versionId &&
            (byId[ref.versionId] || byId[String(ref.versionId).slice(0, 15)]);
        if (hit) {
            // eslint-disable-next-line no-await-in-loop
            const entry = await imageEntry(hit.mimeType, hit.base64);
            if (entry) images[ref.url] = entry;
            continue;
        }
        // No file id (a theme photo, a same-site path): read it directly when
        // the browser is allowed to; skip it when not.
        const type = typeFromUrl(ref.url);
        if (type && !/^https?:/i.test(ref.url)) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const bytes = await fetchBytes(ref.url);
                images[ref.url] = {
                    bytes,
                    type: type === 'image/png' ? 'png' : 'jpg'
                };
            } catch {
                // left out
            }
        }
    }
    return images;
}

/** Hands the bytes to the browser as a download named `fileName`. */
export function saveBytes(bytes, fileName) {
    let href;
    let revoke = null;
    try {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        href = URL.createObjectURL(blob);
        revoke = href;
    } catch {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(
                null,
                bytes.subarray(i, i + 0x8000)
            );
        }
        href = `data:application/pdf;base64,${btoa(bin)}`;
    }
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (revoke) {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => URL.revokeObjectURL(revoke), 30000);
    }
}

/**
 * Builds and saves one PDF.
 * @param {object} opts
 * @param {object} opts.component   the calling LWC (loadScript needs it)
 * @param {object} opts.doc         c/finalPdfModel output
 * @param {object} opts.tokens      the form's `--c-*` tokens
 * @param {Function} [opts.loadImages] (versionIds) => Promise<{ images: [{ id, mimeType, base64 }] }>
 * @param {string} opts.fileName
 * @returns {Promise<void>} rejects with an Error whose message is PDF_FAILED
 */
export async function downloadPdf(opts) {
    try {
        const { lib, fontkit } = await loadLibs(opts.component);
        const theme = pdfTheme(opts.tokens || {});
        const [fonts, fallbackFonts, images] = await Promise.all([
            loadFonts(theme),
            loadFallbacks(opts.doc),
            loadImages(opts.doc, opts.loadImages)
        ]);
        const bytes = await renderPdf({
            lib,
            fontkit,
            doc: opts.doc,
            theme,
            fonts,
            fallbackFonts,
            images,
            locale: LOCALE,
            pageSize: pageSizeFor(LOCALE)
        });
        saveBytes(bytes, opts.fileName);
    } catch (e) {
        console.error('PDF build failed', e);
        throw new Error(PDF_FAILED);
    }
}

export { LOCALE };
