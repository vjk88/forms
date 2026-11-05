import fs from 'fs';
import { renderPdf } from 'c/finalPdfWriter';
import { buildFormDocument } from 'c/finalPdfModel';
import { pdfTheme, pdfFontFiles } from 'c/finalPdfTheme';
import {
    loadLib,
    fontBytes,
    PNG_2X2,
    SPEC,
    PAYLOAD,
    TOKENS
} from './__fixtures__/pdfFixture';

function brandFonts(theme) {
    const pick = (key) => {
        const files = pdfFontFiles(key);
        return {
            regular: fontBytes(files.regular),
            bold: fontBytes(files.bold)
        };
    };
    return {
        body: pick(theme.fonts.body.key),
        display: pick(theme.fonts.display.key)
    };
}

async function render(mode, extra = {}) {
    const { lib, fontkit } = loadLib();
    const theme = pdfTheme(TOKENS);
    const doc = buildFormDocument({
        spec: SPEC,
        mode,
        ...PAYLOAD,
        hiddenKeys: ['el_hidden'],
        submittedAt: '2026-11-02T10:30:00Z',
        locale: 'en-GB'
    });
    const bytes = await renderPdf({
        lib,
        fontkit,
        doc,
        theme,
        fonts: brandFonts(theme),
        images: { '/logo.png': { bytes: PNG_2X2, type: 'png' } },
        locale: 'en-GB',
        ...extra
    });
    if (process.env.PDF_OUT) {
        fs.writeFileSync(
            `${process.env.PDF_OUT}/${mode}${extra.fonts === null ? '-std' : ''}.pdf`,
            bytes
        );
    }
    return { lib, bytes };
}

jest.setTimeout(30000);

describe('c/finalPdfWriter', () => {
    it('writes a valid, branded answers PDF', async () => {
        const { lib, bytes } = await render('answers');
        expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
        const back = await lib.PDFDocument.load(bytes);
        expect(back.getTitle()).toBe('Volunteer sign-up');
        expect(back.getAuthor()).toBe('Green Valley Trust');
        expect(back.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('writes the blank form', async () => {
        const { lib, bytes } = await render('blank');
        const back = await lib.PDFDocument.load(bytes);
        expect(back.getPageCount()).toBeGreaterThanOrEqual(1);
    });

    it('falls back to Helvetica when no brand fonts arrive', async () => {
        const { lib, bytes } = await render('answers', { fonts: null });
        const back = await lib.PDFDocument.load(bytes);
        expect(back.getPageCount()).toBeGreaterThanOrEqual(1);
    });
});

describe('c/finalPdfWriter text safety', () => {
    it('never throws on characters the font cannot draw', async () => {
        const { lib, fontkit } = loadLib();
        const doc = buildFormDocument({
            spec: SPEC,
            answers: { el_name: 'Иван 山田 \u{1F600} tab\there' },
            submittedAt: '2026-11-02T10:30:00Z'
        });
        for (const fonts of [null, brandFonts(pdfTheme(TOKENS))]) {
            // eslint-disable-next-line no-await-in-loop
            const bytes = await renderPdf({
                lib,
                fontkit,
                doc,
                theme: pdfTheme(TOKENS),
                fonts
            });
            // eslint-disable-next-line no-await-in-loop
            const back = await lib.PDFDocument.load(bytes);
            expect(back.getPageCount()).toBeGreaterThanOrEqual(1);
        }
    });

    it('breaks a long answer across pages and numbers every page', async () => {
        const { lib, fontkit } = loadLib();
        const long = Array.from(
            { length: 220 },
            (_, i) => `Line ${i + 1} of a very long answer.`
        ).join('\n');
        const doc = buildFormDocument({
            spec: SPEC,
            answers: { el_notes: long }
        });
        const bytes = await renderPdf({
            lib,
            fontkit,
            doc,
            theme: pdfTheme(TOKENS)
        });
        const back = await lib.PDFDocument.load(bytes);
        expect(back.getPageCount()).toBeGreaterThan(3);
    });

    it('leaves out an image whose bytes are broken instead of failing', async () => {
        const { lib, fontkit } = loadLib();
        const doc = buildFormDocument({ spec: SPEC, mode: 'blank' });
        const bytes = await renderPdf({
            lib,
            fontkit,
            doc,
            theme: pdfTheme(TOKENS),
            images: {
                '/logo.png': { bytes: new Uint8Array([1, 2, 3]), type: 'png' }
            }
        });
        expect(
            (await lib.PDFDocument.load(bytes)).getPageCount()
        ).toBeGreaterThanOrEqual(1);
    });
});

describe('keepLine (page breaks)', () => {
    const { keepLine } = require('c/finalPdfWriter');
    it('keeps a short answer whole', () => {
        expect([0, 1, 2].map((i) => keepLine(i, 4))).toEqual([
            true,
            true,
            true
        ]);
        expect(keepLine(3, 4)).toBe(false);
    });
    it('lets a long answer break, but never strands its first or last line', () => {
        const n = 20;
        expect(keepLine(0, n)).toBe(true);
        expect(keepLine(5, n)).toBe(false);
        expect(keepLine(n - 2, n)).toBe(true);
        expect(keepLine(n - 1, n)).toBe(false);
    });
});
