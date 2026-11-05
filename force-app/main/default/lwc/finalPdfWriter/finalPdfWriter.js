/**
 * finalPdfWriter — draws a document model (c/finalPdfModel) into PDF bytes
 * with pdf-lib (IMPL_PLAN_FORM_PDF §4.5).
 *
 * Layout in one sentence: every block becomes ROWS (atomic slices with a
 * height and a draw function), and a paginator lays rows top to bottom,
 * starting a new page when the next row (and any row it must stay with)
 * would not fit. Long answers, long rich text and long matrices therefore
 * break between lines, never through one; a question's label never sits
 * alone at the bottom of a page.
 *
 * The branded parts: a header band in the form's header colors, with the
 * banner image above it and the logo, brand name, title and description in
 * it; accent headings and rules; the form's own fonts (embedded from the
 * `formPdfFonts` TrueType copies); a thin accent bar on every later page;
 * a footer with the form's name and "Page n of m".
 *
 * Pure apart from pdf-lib, which the caller passes in (`lib`, the PDFLib
 * namespace, and optionally `fontkit`) — so Node can run the same code in
 * tests that the browser runs from the static resource.
 */

const PAGE_SIZES = {
    A4: [595.28, 841.89],
    Letter: [612, 792]
};

const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60;
const FOOTER_Y = 30;

const SIZE = {
    title: 22,
    brand: 12,
    description: 11,
    meta: 9,
    page: 15,
    section: 12.5,
    sectionDesc: 9.5,
    entry: 10.5,
    label: 9.5,
    answer: 11,
    note: 8.5,
    option: 10.5,
    text: 10.5,
    footer: 8
};

const IMAGE_WIDTH = { small: 120, medium: 240, large: 390 };

/** Answers up to this many lines never break across pages. */
const KEEP_LINES = 8;

/**
 * Whether line `i` of `n` must stay on the same page as the next line:
 * a short answer stays whole; a long one may break, but never strands its
 * first or last line alone (no widows, no orphans).
 */
export function keepLine(i, n) {
    if (i >= n - 1) return false;
    return n <= KEEP_LINES || i === 0 || i >= n - 2;
}

// ----------------------------------------------------------------- utils --

function toRgb(lib, c) {
    return lib.rgb(c.r / 255, c.g / 255, c.b / 255);
}

function tint(c, amount) {
    // `amount` of the color over white paper
    return {
        r: Math.round(c.r * amount + 255 * (1 - amount)),
        g: Math.round(c.g * amount + 255 * (1 - amount)),
        b: Math.round(c.b * amount + 255 * (1 - amount)),
        a: 1
    };
}

/** Characters the font can draw; anything else becomes '?' (never tofu). */
function sanitizer(font) {
    let set = null;
    try {
        set = new Set(font.getCharacterSet());
    } catch {
        set = null;
    }
    return (text) => {
        const s = String(text ?? '')
            .replace(/\u00a0/g, ' ')
            .replace(/[\u200b-\u200d\ufeff]/g, '')
            .replace(/\t/g, '    ');
        if (!set) return s;
        let out = '';
        for (const ch of s) {
            const cp = ch.codePointAt(0);
            out += set.has(cp) || cp === 10 ? ch : '?';
        }
        return out;
    };
}

/** Rounded rectangle as an SVG path (origin top-left, y down). */
function roundedRectPath(w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    return [
        `M ${rr} 0`,
        `H ${w - rr}`,
        `Q ${w} 0 ${w} ${rr}`,
        `V ${h - rr}`,
        `Q ${w} ${h} ${w - rr} ${h}`,
        `H ${rr}`,
        `Q 0 ${h} 0 ${h - rr}`,
        `V ${rr}`,
        `Q 0 0 ${rr} 0`,
        'Z'
    ].join(' ');
}

// ---------------------------------------------------------------- writer --

/**
 * @param {object} opts
 * @param {object} opts.lib       the PDFLib namespace (pdf-lib)
 * @param {object} [opts.fontkit] @pdf-lib/fontkit (needed for brand fonts)
 * @param {object} opts.doc       c/finalPdfModel output
 * @param {object} opts.theme     c/finalPdfTheme pdfTheme() output
 * @param {object} [opts.fonts]   { body: {regular, bold}, display: {regular, bold} } TTF bytes
 * @param {object} [opts.images]  url → { bytes, type: 'png'|'jpg' }
 * @param {'A4'|'Letter'} [opts.pageSize]
 * @param {string} [opts.locale]
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(opts) {
    const { lib, fontkit, doc, theme } = opts;
    const images = opts.images || {};
    const [pageW, pageH] = PAGE_SIZES[opts.pageSize] || PAGE_SIZES.A4;
    const contentW = pageW - MARGIN_X * 2;

    const pdf = await lib.PDFDocument.create();
    pdf.setTitle(doc.title || 'Form');
    if (doc.brandName) pdf.setAuthor(doc.brandName);
    pdf.setCreator('Forms');
    pdf.setProducer('Forms PDF (pdf-lib)');
    pdf.setCreationDate(new Date());
    if (opts.locale) {
        try {
            pdf.setLanguage(String(opts.locale).replace('_', '-'));
        } catch {
            // language is a courtesy, never a failure
        }
    }

    // ---- fonts: brand TrueType when we have it, Helvetica otherwise ----
    const fonts = await embedFonts(lib, fontkit, pdf, opts.fonts);
    const clean = {
        body: sanitizer(fonts.body),
        bodyBold: sanitizer(fonts.bodyBold),
        display: sanitizer(fonts.display)
    };
    const cleanFor = (font) => {
        if (font === fonts.bodyBold) return clean.bodyBold;
        if (font === fonts.display) return clean.display;
        return clean.body;
    };

    // ---- images: embedded once each ----
    const embedded = new Map();
    async function image(ref) {
        const url = ref && (typeof ref === 'string' ? ref : ref.url);
        if (!url || !images[url]) return null;
        if (embedded.has(url)) return embedded.get(url);
        const { bytes, type } = images[url];
        let img = null;
        try {
            img =
                type === 'png'
                    ? await pdf.embedPng(bytes)
                    : await pdf.embedJpg(bytes);
        } catch {
            img = null; // a broken image is left out, the PDF still builds
        }
        embedded.set(url, img);
        return img;
    }

    const color = (c) => toRgb(lib, c);
    const C = {
        text: color(theme.text),
        weak: color(theme.textWeak),
        accent: color(theme.accent),
        accentFill: color(theme.accentFill),
        headerBg: color(theme.headerBg),
        headerText: color(theme.headerText),
        headerWeak: color(theme.headerTextWeak),
        border: color(theme.border),
        hairline: color(theme.hairline),
        calloutBg: color(tint(theme.accentFill, 0.08)),
        white: lib.rgb(1, 1, 1)
    };

    // ---- text measuring + wrapping ----
    function width(str, font, size) {
        return font.widthOfTextAtSize(cleanFor(font)(str), size);
    }

    function wrap(str, font, size, maxW) {
        const out = [];
        const paragraphs = cleanFor(font)(str).split('\n');
        for (const para of paragraphs) {
            const words = para.split(/(\s+)/);
            let line = '';
            for (const piece of words) {
                if (!piece) continue;
                const next = line + piece;
                if (font.widthOfTextAtSize(next.trimEnd(), size) <= maxW) {
                    line = next;
                    continue;
                }
                if (line.trim()) out.push(line.trimEnd());
                line = /^\s+$/.test(piece) ? '' : piece;
                // one word longer than the line: break it by characters
                while (font.widthOfTextAtSize(line, size) > maxW) {
                    let cut = line.length - 1;
                    while (
                        cut > 1 &&
                        font.widthOfTextAtSize(line.slice(0, cut), size) > maxW
                    ) {
                        cut--;
                    }
                    out.push(line.slice(0, cut));
                    line = line.slice(cut);
                }
            }
            out.push(line.trimEnd());
        }
        return out.length ? out : [''];
    }

    /** Styled runs wrapped to lines: [[{ text, font }]] */
    function wrapRuns(runs, size, maxW) {
        const lines = [[]];
        let lineW = 0;
        for (const run of runs) {
            const font = run.bold ? fonts.bodyBold : fonts.body;
            const pieces = cleanFor(font)(run.text).split(/(\s+)/);
            for (const piece of pieces) {
                if (!piece) continue;
                const w = font.widthOfTextAtSize(piece, size);
                const isSpace = /^\s+$/.test(piece);
                if (lineW + w > maxW && lineW > 0 && !isSpace) {
                    lines.push([]);
                    lineW = 0;
                }
                if (isSpace && lineW === 0) continue;
                const line = lines[lines.length - 1];
                const last = line[line.length - 1];
                if (last && last.font === font) {
                    last.text += isSpace ? ' ' : piece;
                } else {
                    line.push({ text: isSpace ? ' ' : piece, font });
                }
                lineW += isSpace ? font.widthOfTextAtSize(' ', size) : w;
            }
        }
        return lines.filter((l) => l.length);
    }

    const lh = (size) => size * 1.38;

    // ---- pages ----
    const pages = [];
    let page = null;
    let y = 0; // distance from the top of the current page

    function newPage() {
        page = pdf.addPage([pageW, pageH]);
        pages.push(page);
        if (pages.length > 1) {
            // the brand carries onto every page as a thin accent bar
            page.drawRectangle({
                x: 0,
                y: pageH - 5,
                width: pageW,
                height: 5,
                color: C.accentFill
            });
        }
        y = MARGIN_TOP;
    }

    function text(str, x, top, font, size, col) {
        page.drawText(cleanFor(font)(str), {
            x,
            y: pageH - top - size,
            size,
            font,
            color: col
        });
    }

    function rule(x, top, w, col, thickness = 0.75) {
        page.drawLine({
            start: { x, y: pageH - top },
            end: { x: x + w, y: pageH - top },
            thickness,
            color: col
        });
    }

    function roundRect(x, top, w, h, { fill, stroke, r, borderWidth = 0.8 }) {
        page.drawSvgPath(roundedRectPath(w, h, r ?? theme.radius), {
            x,
            y: pageH - top,
            color: fill,
            borderColor: stroke,
            borderWidth: stroke ? borderWidth : 0
        });
    }

    function circle(cx, cyTop, radius, { fill, stroke }) {
        page.drawCircle({
            x: cx,
            y: pageH - cyTop,
            size: radius,
            color: fill,
            borderColor: stroke,
            borderWidth: stroke ? 0.8 : 0
        });
    }

    function tick(x, top, s, col) {
        // a drawn check mark: no font has to carry the glyph
        page.drawSvgPath(
            `M ${s * 0.18} ${s * 0.52} L ${s * 0.42} ${s * 0.76} L ${s * 0.84} ${s * 0.26}`,
            {
                x,
                y: pageH - top,
                borderColor: col,
                borderWidth: Math.max(1.2, s * 0.14)
            }
        );
    }

    function bar(x, top, w, h, col) {
        page.drawRectangle({
            x,
            y: pageH - top - h,
            width: w,
            height: h,
            color: col
        });
    }

    function picture(img, x, top, w, h) {
        page.drawImage(img, { x, y: pageH - top - h, width: w, height: h });
    }

    // every image block, embedded before layout (rows draw synchronously)
    await Promise.all(
        doc.blocks.filter((b) => b.kind === 'image').map((b) => image(b))
    );

    // ---- header (first page) ----
    newPage();
    await drawHeader();

    async function drawHeader() {
        let top = 0;
        const banner = await image(doc.banner);
        if (banner) {
            const bh = 120;
            const scale = Math.max(pageW / banner.width, bh / banner.height);
            const w = banner.width * scale;
            const h = banner.height * scale;
            page.pushOperators(
                lib.pushGraphicsState(),
                lib.rectangle(0, pageH - bh, pageW, bh),
                lib.clip(),
                lib.endPath()
            );
            page.drawImage(banner, {
                x: (pageW - w) / 2,
                y: pageH - bh - (h - bh) / 2,
                width: w,
                height: h
            });
            page.pushOperators(lib.popGraphicsState());
            top = bh;
        }

        const pad = 26;
        const innerW = pageW - MARGIN_X * 2;
        const logo = await image(doc.logo);
        let logoBox = null;
        if (logo) {
            const s = Math.min(160 / logo.width, 44 / logo.height, 1);
            logoBox = { w: logo.width * s, h: logo.height * s };
        }
        const titleLines = wrap(doc.title, fonts.display, SIZE.title, innerW);
        const descLines = doc.description
            ? wrap(doc.description, fonts.body, SIZE.description, innerW)
            : [];
        const brandLine = !logo && doc.brandName ? doc.brandName : '';
        let h = pad;
        if (logoBox) h += logoBox.h + 12;
        if (brandLine) h += lh(SIZE.brand) + 6;
        h += titleLines.length * lh(SIZE.title);
        if (descLines.length) h += 4 + descLines.length * lh(SIZE.description);
        if (doc.metaLines.length) h += 8 + doc.metaLines.length * lh(SIZE.meta);
        h += pad;

        page.drawRectangle({
            x: 0,
            y: pageH - top - h,
            width: pageW,
            height: h,
            color: C.headerBg
        });
        let cy = top + pad;
        if (logoBox) {
            page.drawImage(logo, {
                x: MARGIN_X,
                y: pageH - cy - logoBox.h,
                width: logoBox.w,
                height: logoBox.h
            });
            cy += logoBox.h + 12;
        }
        if (brandLine) {
            text(
                brandLine,
                MARGIN_X,
                cy,
                fonts.display,
                SIZE.brand,
                C.headerText
            );
            cy += lh(SIZE.brand) + 6;
        }
        for (const line of titleLines) {
            text(line, MARGIN_X, cy, fonts.display, SIZE.title, C.headerText);
            cy += lh(SIZE.title);
        }
        if (descLines.length) {
            cy += 4;
            for (const line of descLines) {
                text(
                    line,
                    MARGIN_X,
                    cy,
                    fonts.body,
                    SIZE.description,
                    C.headerWeak
                );
                cy += lh(SIZE.description);
            }
        }
        if (doc.metaLines.length) {
            cy += 8;
            for (const line of doc.metaLines) {
                text(line, MARGIN_X, cy, fonts.body, SIZE.meta, C.headerWeak);
                cy += lh(SIZE.meta);
            }
        }
        let bottom = top + h;
        if (theme.headerIsPaper) {
            // a white header still gets the brand: an accent rule under it
            page.drawRectangle({
                x: MARGIN_X,
                y: pageH - bottom - 3,
                width: innerW,
                height: 3,
                color: C.accentFill
            });
            bottom += 3;
        }
        y = bottom + 22;
    }

    // ---- rows ----
    const rows = [];
    const push = (h, draw, extra = {}) => rows.push({ h, draw, ...extra });

    function labelRows(label, required, help, keep = true) {
        const lines = wrap(label, fonts.bodyBold, SIZE.label, contentW - 10);
        lines.forEach((line, i) => {
            const last = i === lines.length - 1;
            push(
                lh(SIZE.label),
                (top) => {
                    text(
                        line,
                        MARGIN_X,
                        top,
                        fonts.bodyBold,
                        SIZE.label,
                        C.weak
                    );
                    if (last && required) {
                        const w = width(line, fonts.bodyBold, SIZE.label);
                        text(
                            ' *',
                            MARGIN_X + w,
                            top,
                            fonts.bodyBold,
                            SIZE.label,
                            C.accent
                        );
                    }
                },
                { keepWithNext: keep }
            );
        });
        if (help) {
            for (const line of wrap(help, fonts.body, SIZE.note, contentW)) {
                push(
                    lh(SIZE.note),
                    (top) =>
                        text(
                            line,
                            MARGIN_X,
                            top,
                            fonts.body,
                            SIZE.note,
                            C.weak
                        ),
                    { keepWithNext: true }
                );
            }
        }
        push(3, () => {}, { keepWithNext: true });
    }

    function paragraphRows(
        paragraphs,
        {
            x = MARGIN_X,
            w = contentW,
            size = SIZE.text,
            col = C.text,
            keepAll = false
        } = {}
    ) {
        paragraphs.forEach((p, pi) => {
            const indent = p.bullet ? 14 : 0;
            const runs = p.heading
                ? p.runs.map((r) => ({ ...r, bold: true }))
                : p.runs;
            const s = p.heading ? size + 1.5 : size;
            const lines = wrapRuns(runs, s, w - indent);
            lines.forEach((line, li) => {
                push(
                    lh(s),
                    (top) => {
                        if (li === 0 && p.bullet) {
                            text(p.bullet, x, top, fonts.body, s, col);
                        }
                        let cx = x + indent;
                        for (const seg of line) {
                            text(seg.text, cx, top, seg.font, s, col);
                            cx += seg.font.widthOfTextAtSize(seg.text, s);
                        }
                    },
                    {
                        keepWithNext:
                            keepAll ||
                            (li < lines.length - 1 && lines.length <= 3)
                    }
                );
            });
            if (pi < paragraphs.length - 1) push(4, () => {});
        });
    }

    function space(h) {
        push(h, () => {}, { spacer: true });
    }

    for (const block of doc.blocks) {
        switch (block.kind) {
            case 'page': {
                space(14);
                const lines = wrap(
                    block.title,
                    fonts.display,
                    SIZE.page,
                    contentW
                );
                lines.forEach((line) =>
                    push(
                        lh(SIZE.page),
                        (top) =>
                            text(
                                line,
                                MARGIN_X,
                                top,
                                fonts.display,
                                SIZE.page,
                                C.accent
                            ),
                        { keepWithNext: true }
                    )
                );
                push(
                    8,
                    (top) =>
                        rule(MARGIN_X, top + 3, contentW, C.accentFill, 1.2),
                    {
                        keepWithNext: true
                    }
                );
                break;
            }
            case 'section': {
                space(10);
                for (const line of wrap(
                    block.title,
                    fonts.bodyBold,
                    SIZE.section,
                    contentW
                )) {
                    push(
                        lh(SIZE.section),
                        (top) =>
                            text(
                                line,
                                MARGIN_X,
                                top,
                                fonts.bodyBold,
                                SIZE.section,
                                C.text
                            ),
                        { keepWithNext: true }
                    );
                }
                if (block.description) {
                    for (const line of wrap(
                        block.description,
                        fonts.body,
                        SIZE.sectionDesc,
                        contentW
                    )) {
                        push(
                            lh(SIZE.sectionDesc),
                            (top) =>
                                text(
                                    line,
                                    MARGIN_X,
                                    top,
                                    fonts.body,
                                    SIZE.sectionDesc,
                                    C.weak
                                ),
                            { keepWithNext: true }
                        );
                    }
                }
                push(
                    10,
                    (top) => rule(MARGIN_X, top + 4, contentW, C.hairline),
                    {
                        keepWithNext: true
                    }
                );
                break;
            }
            case 'entry': {
                space(4);
                push(
                    lh(SIZE.entry),
                    (top) =>
                        text(
                            block.title,
                            MARGIN_X,
                            top,
                            fonts.bodyBold,
                            SIZE.entry,
                            C.accent
                        ),
                    { keepWithNext: true }
                );
                push(4, () => {}, { keepWithNext: true });
                break;
            }
            case 'qa': {
                labelRows(block.label, false, '');
                const col = block.answered ? C.text : C.weak;
                const all = [];
                for (const line of block.lines) {
                    all.push(...wrap(line, fonts.body, SIZE.answer, contentW));
                }
                all.forEach((line, i) =>
                    push(
                        lh(SIZE.answer),
                        (top) =>
                            text(
                                line,
                                MARGIN_X,
                                top,
                                fonts.body,
                                SIZE.answer,
                                col
                            ),
                        {
                            keepWithNext:
                                keepLine(i, all.length) ||
                                (i === all.length - 1 && Boolean(block.note))
                        }
                    )
                );
                if (block.note) {
                    for (const line of wrap(
                        block.note,
                        fonts.body,
                        SIZE.note,
                        contentW
                    )) {
                        push(lh(SIZE.note), (top) =>
                            text(
                                line,
                                MARGIN_X,
                                top,
                                fonts.body,
                                SIZE.note,
                                C.weak
                            )
                        );
                    }
                }
                space(10);
                break;
            }
            case 'matrix': {
                labelRows(block.label, false, '');
                const leftW = contentW * 0.55;
                const rightW = contentW - leftW - 10;
                block.rows.forEach((r, i) => {
                    const left = wrap(r.label, fonts.body, 10, leftW);
                    const right = wrap(r.value, fonts.bodyBold, 10, rightW);
                    const n = Math.max(left.length, right.length);
                    const h = n * lh(10) + 6;
                    push(
                        h,
                        (top) => {
                            left.forEach((l, k) =>
                                text(
                                    l,
                                    MARGIN_X,
                                    top + 3 + k * lh(10),
                                    fonts.body,
                                    10,
                                    C.text
                                )
                            );
                            right.forEach((l, k) =>
                                text(
                                    l,
                                    MARGIN_X + leftW + 10,
                                    top + 3 + k * lh(10),
                                    r.answered ? fonts.bodyBold : fonts.body,
                                    10,
                                    r.answered ? C.text : C.weak
                                )
                            );
                            if (i < block.rows.length - 1) {
                                rule(
                                    MARGIN_X,
                                    top + h,
                                    contentW,
                                    C.hairline,
                                    0.5
                                );
                            }
                        },
                        { keepWithNext: keepLine(i, block.rows.length) }
                    );
                });
                space(10);
                break;
            }
            case 'consent': {
                if (block.label) labelRows(block.label, false, '');
                const box = 11;
                const textX = MARGIN_X + box + 8;
                const paragraphs = block.paragraphs.length
                    ? block.paragraphs
                    : [
                          {
                              runs: [{ text: 'I agree', bold: false }],
                              bullet: null
                          }
                      ];
                const first = rows.length;
                // the statement, its box and the verdict stay on one page
                paragraphRows(paragraphs, {
                    x: textX,
                    w: contentW - box - 8,
                    size: 10,
                    keepAll: block.checked !== null
                });
                const firstRow = rows[first];
                if (firstRow) {
                    const draw = firstRow.draw;
                    firstRow.draw = (top) => {
                        roundRect(MARGIN_X, top + 1, box, box, {
                            stroke: C.border,
                            fill: C.white,
                            r: 2
                        });
                        if (block.checked === true)
                            tick(MARGIN_X, top + 1, box, C.accent);
                        draw(top);
                    };
                }
                if (block.checked !== null) {
                    const word = block.checked ? 'Agreed' : 'Not agreed';
                    push(lh(SIZE.note) + 2, (top) =>
                        text(
                            word,
                            textX,
                            top + 2,
                            fonts.bodyBold,
                            SIZE.note,
                            block.checked ? C.accent : C.weak
                        )
                    );
                }
                space(10);
                break;
            }
            case 'choices': {
                labelRows(block.label, block.required, block.help);
                const box = 10;
                block.options.forEach((opt, i) => {
                    const lines = wrap(
                        opt,
                        fonts.body,
                        SIZE.option,
                        contentW - 26
                    );
                    const h = lines.length * lh(SIZE.option) + 3;
                    push(
                        h,
                        (top) => {
                            if (block.ranking) {
                                rule(
                                    MARGIN_X,
                                    top + box + 1,
                                    14,
                                    C.border,
                                    0.8
                                );
                            } else if (block.multi) {
                                roundRect(MARGIN_X, top + 2, box, box, {
                                    stroke: C.border,
                                    fill: C.white,
                                    r: 2
                                });
                            } else {
                                circle(
                                    MARGIN_X + box / 2,
                                    top + 2 + box / 2,
                                    box / 2,
                                    { stroke: C.border, fill: C.white }
                                );
                            }
                            lines.forEach((l, k) =>
                                text(
                                    l,
                                    MARGIN_X + 22,
                                    top + k * lh(SIZE.option),
                                    fonts.body,
                                    SIZE.option,
                                    C.text
                                )
                            );
                        },
                        { keepWithNext: keepLine(i, block.options.length) }
                    );
                });
                space(10);
                break;
            }
            case 'scale': {
                labelRows(block.label, block.required, block.help);
                const n = block.points.length;
                const d = Math.min(26, (contentW - (n - 1) * 6) / n);
                push(
                    d + 4,
                    (top) => {
                        block.points.forEach((p, i) => {
                            const cx = MARGIN_X + d / 2 + i * (d + 6);
                            circle(cx, top + d / 2, d / 2, {
                                stroke: C.border,
                                fill: C.white
                            });
                            const w = width(p, fonts.body, 9);
                            text(
                                p,
                                cx - w / 2,
                                top + d / 2 - 5.5,
                                fonts.body,
                                9,
                                C.text
                            );
                        });
                    },
                    { keepWithNext: Boolean(block.lowLabel || block.highLabel) }
                );
                if (block.lowLabel || block.highLabel) {
                    push(lh(SIZE.note), (top) => {
                        text(
                            block.lowLabel,
                            MARGIN_X,
                            top,
                            fonts.body,
                            SIZE.note,
                            C.weak
                        );
                        const end = MARGIN_X + n * d + (n - 1) * 6;
                        const w = width(block.highLabel, fonts.body, SIZE.note);
                        text(
                            block.highLabel,
                            end - w,
                            top,
                            fonts.body,
                            SIZE.note,
                            C.weak
                        );
                    });
                }
                space(10);
                break;
            }
            case 'matrixBlank': {
                labelRows(block.label, block.required, block.help);
                const cols = block.columns.length || 1;
                const labelW = contentW * 0.4;
                const colW = (contentW - labelW) / cols;
                const heads = block.columns.map((c) =>
                    wrap(c, fonts.body, 8, colW - 4)
                );
                const headH =
                    Math.max(1, ...heads.map((h) => h.length)) * lh(8) + 4;
                push(
                    headH,
                    (top) => {
                        heads.forEach((lines, i) =>
                            lines.forEach((l, k) => {
                                const w = width(l, fonts.body, 8);
                                text(
                                    l,
                                    MARGIN_X +
                                        labelW +
                                        i * colW +
                                        (colW - w) / 2,
                                    top + k * lh(8),
                                    fonts.body,
                                    8,
                                    C.weak
                                );
                            })
                        );
                    },
                    { keepWithNext: true }
                );
                block.rows.forEach((r) => {
                    const lines = wrap(r, fonts.body, 10, labelW - 6);
                    const h = Math.max(lines.length * lh(10), 16) + 6;
                    push(h, (top) => {
                        rule(MARGIN_X, top, contentW, C.hairline, 0.5);
                        lines.forEach((l, k) =>
                            text(
                                l,
                                MARGIN_X,
                                top + 4 + k * lh(10),
                                fonts.body,
                                10,
                                C.text
                            )
                        );
                        for (let i = 0; i < cols; i++) {
                            circle(
                                MARGIN_X + labelW + i * colW + colW / 2,
                                top + h / 2,
                                5,
                                { stroke: C.border, fill: C.white }
                            );
                        }
                    });
                });
                space(10);
                break;
            }
            case 'field': {
                labelRows(block.label, block.required, block.help);
                const h = block.lines * 18 + 8;
                push(h, (top) => {
                    roundRect(MARGIN_X, top, contentW, h, {
                        stroke: C.border,
                        fill: C.white
                    });
                    if (block.hint) {
                        text(
                            block.hint,
                            MARGIN_X + 8,
                            top + (h - SIZE.note) / 2 - 1,
                            fonts.body,
                            SIZE.note,
                            C.weak
                        );
                    }
                });
                space(12);
                break;
            }
            case 'text': {
                paragraphRows(block.paragraphs);
                space(10);
                break;
            }
            case 'callout': {
                const pad = 10;
                const inner = [];
                const start = rows.length;
                paragraphRows(block.paragraphs, {
                    x: MARGIN_X + pad + 4,
                    w: contentW - pad * 2 - 4,
                    size: 10
                });
                inner.push(...rows.splice(start));
                const total = inner.reduce((s, r) => s + r.h, 0) + pad * 2;
                if (total < 400) {
                    // short callouts stay whole, as one panel
                    push(total, (top) => {
                        roundRect(MARGIN_X, top, contentW, total, {
                            fill: C.calloutBg
                        });
                        bar(MARGIN_X, top, 3, total, C.accentFill);
                        let cy = top + pad;
                        for (const r of inner) {
                            r.draw(cy);
                            cy += r.h;
                        }
                    });
                } else {
                    rows.push(...inner);
                }
                space(12);
                break;
            }
            case 'image': {
                const img = embedded.get(block.url);
                if (!img) break;
                const maxW = IMAGE_WIDTH[block.size] || contentW;
                const s = Math.min(
                    maxW / img.width,
                    320 / img.height,
                    contentW / img.width
                );
                const w = img.width * s;
                const h = img.height * s;
                push(h, (top) => picture(img, MARGIN_X, top, w, h));
                space(12);
                break;
            }
            case 'divider': {
                push(14, (top) =>
                    rule(MARGIN_X, top + 7, contentW, C.hairline)
                );
                break;
            }
            default:
                break;
        }
    }

    // ---- paginate ----
    const bottomLimit = pageH - MARGIN_BOTTOM;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.spacer && y === MARGIN_TOP) continue; // no gap at a page top
        // the height this row needs together with the rows it keeps with
        let need = row.h;
        for (let j = i; j < rows.length - 1 && rows[j].keepWithNext; j++) {
            need += rows[j + 1].h;
            if (need > (bottomLimit - MARGIN_TOP) * 0.5) break;
        }
        if (y + need > bottomLimit && y > MARGIN_TOP) {
            newPage();
            if (row.spacer) continue;
        }
        row.draw(y);
        y += row.h;
    }

    // ---- footers: form name + page n of m ----
    pages.forEach((p, i) => {
        page = p;
        rule(MARGIN_X, pageH - FOOTER_Y - 12, contentW, C.hairline, 0.5);
        const note = doc.footerNote || doc.title || '';
        const label = `Page ${i + 1} of ${pages.length}`;
        const lw = width(label, fonts.body, SIZE.footer);
        const noteLine = wrap(
            note,
            fonts.body,
            SIZE.footer,
            contentW - lw - 20
        )[0];
        text(
            noteLine,
            MARGIN_X,
            pageH - FOOTER_Y - 6,
            fonts.body,
            SIZE.footer,
            C.weak
        );
        text(
            label,
            pageW - MARGIN_X - lw,
            pageH - FOOTER_Y - 6,
            fonts.body,
            SIZE.footer,
            C.weak
        );
    });

    return pdf.save();
}

/** Brand fonts when their bytes are here and embed; Helvetica otherwise. */
async function embedFonts(lib, fontkit, pdf, bytes) {
    const std = {
        body: await pdf.embedFont(lib.StandardFonts.Helvetica),
        bodyBold: await pdf.embedFont(lib.StandardFonts.HelveticaBold)
    };
    const out = {
        body: std.body,
        bodyBold: std.bodyBold,
        display: std.bodyBold
    };
    if (!fontkit || !bytes) {
        return out;
    }
    pdf.registerFontkit(fontkit);
    const tryEmbed = async (b) => {
        if (!b) return null;
        try {
            return await pdf.embedFont(b, { subset: true });
        } catch {
            return null;
        }
    };
    const body = bytes.body || {};
    const display = bytes.display || {};
    out.body = (await tryEmbed(body.regular)) || out.body;
    out.bodyBold = (await tryEmbed(body.bold)) || out.bodyBold;
    out.display =
        (await tryEmbed(display.bold || display.regular)) || out.bodyBold;
    return out;
}
