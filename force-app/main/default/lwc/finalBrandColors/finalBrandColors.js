/**
 * finalBrandColors — colour suggestions from a logo
 * (IMPL_PLAN_FONTS_AND_BRAND_THEME §B.3).
 *
 *   readImagePixels(dataUrl) → Promise<Uint8ClampedArray> (RGBA)
 *     The file the person just chose, drawn into an off-screen canvas at most
 *     128px wide. It is their own same-origin data URL, so the canvas can be
 *     read; nothing is uploaded for this.
 *   suggestColors(pixels, { max }) → [{ hex, share }]
 *     Pure. Skips transparent, near-white, near-black and grey pixels, groups
 *     the rest by hue and lightness, drops the soft anti-aliased edge blends
 *     of a stronger colour with white or black, and returns up to `max`
 *     colours ranked by how much of the logo they cover. [] when nothing usable is left (a
 *     black-only or grey logo) — the dialog then offers the hex box.
 */

const MAX_SIDE = 128;
const HUE_BINS = 18; // 20° each

function hsl(r, g, b) {
    const R = r / 255;
    const G = g / 255;
    const B = b / 255;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (max === min) {
        return { h: 0, s: 0, l };
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === R) {
        h = ((G - B) / d + (G < B ? 6 : 0)) * 60;
    } else if (max === G) {
        h = ((B - R) / d + 2) * 60;
    } else {
        h = ((R - G) / d + 4) * 60;
    }
    return { h, s, l };
}

const toHex = (rgb) =>
    `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const distance = (a, b) =>
    Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/**
 * True when `c` is just a blend of colour `p` with the logo's backdrop
 * (`bg`, white or black): the soft edge pixels anti-aliasing puts around
 * every shape and letter. Those are not brand colours. Only the real
 * backdrop counts, so a second, darker brand colour on a white logo (navy
 * next to blue) is never mistaken for an edge.
 */
function isBlendOf(c, p, bg) {
    const d = bg.map((v, i) => v - p[i]);
    const len2 = d.reduce((sum, v) => sum + v * v, 0);
    if (!len2) {
        return false;
    }
    const t = Math.min(
        1,
        Math.max(0, c.reduce((sum, v, i) => sum + (v - p[i]) * d[i], 0) / len2)
    );
    // t near 0 means c is p itself, not a blend: the duplicate rule
    // (distance >= 40) handles that, keeping the stronger one
    if (t < 0.1) {
        return false;
    }
    const onLine = p.map((v, i) => v + d[i] * t);
    // Edges are blended by the browser in a way that bends the path away
    // from a straight sRGB line, most in the middle of the blend: allow more
    // there (25 at the ends, about 40 halfway).
    return distance(c, onLine) < 25 + 60 * t * (1 - t);
}

/**
 * @param {ArrayLike<number>} pixels RGBA bytes
 * @param {{max?: number}} options
 * @returns {Array<{hex: string, share: number}>}
 */
export function suggestColors(pixels, { max = 5 } = {}) {
    if (
        !pixels ||
        typeof pixels === 'string' ||
        typeof pixels.length !== 'number'
    ) {
        return [];
    }
    const buckets = new Map();
    const backdropCount = { white: 0, black: 0 };
    let counted = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (
            !Number.isFinite(r + g + b + pixels[i + 3]) ||
            pixels[i + 3] < 128
        ) {
            continue; // junk, or transparent
        }
        const { h, s, l } = hsl(r, g, b);
        if (l > 0.92) {
            backdropCount.white += 1;
            continue; // near-white
        }
        if (l < 0.08) {
            backdropCount.black += 1;
            continue; // near-black
        }
        if (s < 0.18) {
            continue; // grey
        }
        counted += 1;
        const band = l < 0.35 ? 0 : l < 0.65 ? 1 : 2;
        const key = `${Math.floor(h / (360 / HUE_BINS)) % HUE_BINS}:${band}`;
        const bucket = buckets.get(key) || { n: 0, sum: [0, 0, 0] };
        bucket.n += 1;
        bucket.sum[0] += r;
        bucket.sum[1] += g;
        bucket.sum[2] += b;
        buckets.set(key, bucket);
    }
    if (!counted) {
        return [];
    }
    const ranked = [...buckets.values()]
        .filter((bk) => bk.n / counted >= 0.005) // stray anti-aliasing pixels
        .sort((a, b) => b.n - a.n)
        .map((bk) => ({
            rgb: bk.sum.map((v) => v / bk.n),
            share: bk.n / counted
        }));
    // Thin strokes (text) can have more soft edge pixels than solid core, so
    // a blend is judged against EVERY other candidate, not only stronger ones.
    const backdrop = backdropCount.black > backdropCount.white ? BLACK : WHITE;
    const cores = ranked.filter(
        (c) => !ranked.some((o) => o !== c && isBlendOf(c.rgb, o.rgb, backdrop))
    );
    const picked = [];
    for (const c of cores) {
        if (picked.every((p) => distance(p.rgb, c.rgb) >= 40)) {
            picked.push(c);
        }
        if (picked.length >= max) {
            break;
        }
    }
    return picked.map((c) => ({
        hex: toHex(c.rgb),
        share: Math.round(c.share * 100) / 100
    }));
}

/**
 * The pixels of an image data URL, scaled so its longer side is at most
 * 128px. Rejects when the image cannot be decoded.
 */
export function readImagePixels(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(
                1,
                MAX_SIDE / Math.max(img.width || 1, img.height || 1)
            );
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(ctx.getImageData(0, 0, w, h).data);
        };
        img.onerror = () => reject(new Error('The image could not be read.'));
        img.src = dataUrl;
    });
}

const UPLOAD_SIDE = 1024;
// Base64 above this size risks the Aura request and the Apex heap (a 5 MB
// file is about 6.7 MB of base64; the old build's practical cap was ~4.3 MB).
const UPLOAD_CHARS = 3500000;

/**
 * The logo as it should be uploaded: unchanged when it is already small,
 * otherwise redrawn at most 1024px on its longer side as PNG (a header logo
 * shows under 80px tall). Resolves to a data URL.
 */
export function logoForUpload(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const side = Math.max(img.width || 1, img.height || 1);
            if (side <= UPLOAD_SIDE && String(dataUrl).length <= UPLOAD_CHARS) {
                resolve(dataUrl);
                return;
            }
            const scale = Math.min(1, UPLOAD_SIDE / side);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas
                .getContext('2d')
                .drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('The image could not be read.'));
        img.src = dataUrl;
    });
}
