import {
    downloadPdf,
    fallbackSubsetsFor,
    pageSizeFor,
    imageRefs,
    resetForTests,
    PDF_FAILED
} from 'c/finalPdfService';
import { buildFormDocument } from 'c/finalPdfModel';
import {
    loadLib,
    SPEC,
    PAYLOAD,
    TOKENS,
    PNG_2X2
} from '../../finalPdfWriter/__tests__/__fixtures__/pdfFixture';

const fs = require('fs');
const path = require('path');

const FONTS = path.resolve(__dirname, '../../../staticresources/formPdfFonts');

jest.setTimeout(30000);

function b64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

describe('c/finalPdfService', () => {
    let saved;
    beforeEach(() => {
        resetForTests();
        const { lib, fontkit } = loadLib();
        window.PDFLib = lib;
        window.fontkit = fontkit;
        // fonts come from the static resource: serve them from disk
        global.fetch = jest.fn((url) => {
            const rel = String(url).replace(/^.*formPdfFonts\//, '');
            const file = path.join(FONTS, rel);
            if (!fs.existsSync(file)) {
                return Promise.resolve({ ok: false, status: 404 });
            }
            const buf = fs.readFileSync(file);
            return Promise.resolve({
                ok: true,
                arrayBuffer: () =>
                    Promise.resolve(
                        buf.buffer.slice(
                            buf.byteOffset,
                            buf.byteOffset + buf.length
                        )
                    )
            });
        });
        saved = null;
        URL.createObjectURL = jest.fn((blob) => {
            saved = blob;
            return 'blob:pdf';
        });
        URL.revokeObjectURL = jest.fn();
    });

    afterEach(() => {
        delete window.PDFLib;
        delete window.fontkit;
    });

    it('builds and saves a PDF with brand fonts and the logo', async () => {
        const doc = buildFormDocument({ spec: SPEC, ...PAYLOAD });
        const loadImages = jest.fn(() =>
            Promise.resolve({
                images: [
                    {
                        id: '068000000000001AAA',
                        mimeType: 'image/png',
                        base64: b64(PNG_2X2)
                    }
                ]
            })
        );
        const clicks = [];
        const realCreate = document.createElement.bind(document);
        const spy = jest
            .spyOn(document, 'createElement')
            .mockImplementation((tag) => {
                const el = realCreate(tag);
                if (tag === 'a') {
                    el.click = () =>
                        clicks.push({ href: el.href, download: el.download });
                }
                return el;
            });
        await downloadPdf({
            component: {},
            doc,
            tokens: TOKENS,
            loadImages,
            fileName: 'copy.pdf'
        });
        spy.mockRestore();
        expect(loadImages).toHaveBeenCalledWith(['068000000000001']);
        // DM Sans body + Fraunces display, regular and bold of each
        const fetched = global.fetch.mock.calls.map((c) => c[0]);
        expect(fetched.some((u) => u.includes('dmsans/'))).toBe(true);
        expect(fetched.some((u) => u.includes('fraunces/'))).toBe(true);
        expect(clicks).toEqual([{ href: 'blob:pdf', download: 'copy.pdf' }]);
        expect(saved.type).toBe('application/pdf');
        expect(saved.size).toBeGreaterThan(10000);
    });

    it('still builds when fonts and images cannot be loaded', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
        const doc = buildFormDocument({ spec: SPEC, ...PAYLOAD });
        await downloadPdf({
            component: {},
            doc,
            tokens: TOKENS,
            loadImages: () => Promise.reject(new Error('no')),
            fileName: 'x.pdf'
        });
        expect(saved.type).toBe('application/pdf');
    });

    it('fails with one plain message when the library is missing', async () => {
        delete window.PDFLib;
        const doc = buildFormDocument({ spec: SPEC });
        await expect(
            downloadPdf({ component: {}, doc, tokens: {}, fileName: 'x.pdf' })
        ).rejects.toThrow(PDF_FAILED);
    });

    it('picks Letter for US-style locales and A4 elsewhere', () => {
        expect(pageSizeFor('en-US')).toBe('Letter');
        expect(pageSizeFor('en_CA')).toBe('Letter');
        expect(pageSizeFor('en-GB')).toBe('A4');
        expect(pageSizeFor('de')).toBe('A4');
    });

    it('collects the logo, banner and image blocks once each', () => {
        const refs = imageRefs({
            logo: { url: '/a', versionId: '068A' },
            banner: { url: '/b', contentVersionId: '068B' },
            blocks: [
                { kind: 'image', url: '/c', versionId: null },
                { kind: 'qa' }
            ]
        });
        expect(refs).toEqual([
            { url: '/a', versionId: '068A' },
            { url: '/b', versionId: '068B' },
            { url: '/c', versionId: null }
        ]);
    });

    it('downloads only the alphabets a document uses', () => {
        expect(
            fallbackSubsetsFor({ blocks: [{ lines: ['Plain English, café'] }] })
        ).toEqual([]);
        expect(
            fallbackSubsetsFor({ blocks: [{ lines: ['Привет', 'Łódź'] }] })
        ).toEqual(['latin-ext', 'cyrillic']);
        expect(fallbackSubsetsFor({ title: 'Ελληνικά · Việt' })).toEqual([
            'latin-ext',
            'vietnamese',
            'greek'
        ]);
    });

    it('fetches the fallback fonts a Russian answer needs', async () => {
        const doc = buildFormDocument({
            spec: SPEC,
            answers: { el_name: 'Иван' }
        });
        await downloadPdf({
            component: {},
            doc,
            tokens: TOKENS,
            fileName: 'ru.pdf'
        });
        const fetched = global.fetch.mock.calls.map((c) => c[0]);
        expect(
            fetched.some((u) =>
                u.includes('fallback/NotoSans-cyrillic-400.ttf')
            )
        ).toBe(true);
        expect(fetched.some((u) => u.includes('greek'))).toBe(false);
    });
});
