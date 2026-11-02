import {
    parseColor,
    contrast,
    pdfTheme,
    pdfFontFor,
    pdfFontFiles
} from 'c/finalPdfTheme';
import { BUNDLED_FONTS } from 'c/finalFontFamilies';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme, listBuiltinThemes } from 'c/finalThemeCatalog';

const fs = require('fs');
const path = require('path');

describe('parseColor', () => {
    it.each([
        ['#0f766e', { r: 15, g: 118, b: 110, a: 1 }],
        ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
        ['#00000080', { r: 0, g: 0, b: 0, a: 128 / 255 }],
        ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
        ['rgba(10,20,30,0.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
        ['rgb(10 20 30 / 25%)', { r: 10, g: 20, b: 30, a: 0.25 }],
        ['hsl(0, 100%, 50%)', { r: 255, g: 0, b: 0, a: 1 }],
        ['white', { r: 255, g: 255, b: 255, a: 1 }]
    ])('%s', (input, out) => {
        const c = parseColor(input);
        expect(c.r).toBe(out.r);
        expect(c.g).toBe(out.g);
        expect(c.b).toBe(out.b);
        expect(c.a).toBeCloseTo(out.a, 3);
    });

    it('resolves var() chains through the token bag, with fallbacks', () => {
        const tokens = { '--a': 'var(--b)', '--b': '#112233' };
        expect(parseColor('var(--a)', tokens)).toMatchObject({
            r: 17,
            g: 34,
            b: 51
        });
        expect(parseColor('var(--missing, #ff0000)', tokens)).toMatchObject({
            r: 255
        });
    });

    it('mixes like CSS color-mix in srgb (transparent lowers alpha)', () => {
        const c = parseColor('color-mix(in srgb, #ffffff 80%, transparent)');
        expect(c).toMatchObject({ r: 255, g: 255, b: 255 });
        expect(c.a).toBeCloseTo(0.8, 3);
    });

    it('reads a gradient as its first stop, and gives up on images', () => {
        expect(
            parseColor('linear-gradient(160deg, #059669, #064e3b)')
        ).toMatchObject({ r: 5, g: 150, b: 105 });
        expect(parseColor('url(/x.png)')).toBeNull();
        expect(parseColor('none')).toBeNull();
    });

    it('never loops on a self-referencing token', () => {
        expect(parseColor('var(--x)', { '--x': 'var(--x)' })).toBeNull();
    });
});

describe('pdfTheme', () => {
    it('replaces body text that would vanish on white paper', () => {
        const t = pdfTheme({
            '--c-text': '#f8fafc',
            '--c-text-weak': '#cbd5e1'
        });
        expect(contrast(t.text, t.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.textWeak, t.paper)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the header readable on its own band', () => {
        const t = pdfTheme({
            '--c-header-bg': '#111827',
            '--c-header-text': '#1f2937'
        });
        expect(contrast(t.headerText, t.headerBg)).toBeGreaterThanOrEqual(4.5);
    });

    it('marks a paper-white header so the writer adds the accent rule', () => {
        expect(pdfTheme({}).headerIsPaper).toBe(true);
        expect(pdfTheme({ '--c-header-bg': '#1f4f36' }).headerIsPaper).toBe(
            false
        );
    });

    it('darkens a pale accent until headings read on white', () => {
        const t = pdfTheme({ '--c-accent': '#fde68a' });
        expect(contrast(t.accent, t.paper)).toBeGreaterThanOrEqual(3);
        expect(t.accentFill).toMatchObject({ r: 253, g: 230, b: 138 });
    });

    it('produces readable colors for every built-in theme', () => {
        for (const entry of listBuiltinThemes()) {
            const key = entry.key || entry.name || entry;
            const t = pdfTheme(resolveTokens(getBuiltinTheme(key), null));
            expect(contrast(t.text, t.paper)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(t.headerText, t.headerBg)).toBeGreaterThanOrEqual(
                4.5
            );
            expect(contrast(t.accent, t.paper)).toBeGreaterThanOrEqual(3);
        }
    });
});

describe('fonts', () => {
    it('finds the bundled family a stack names first', () => {
        expect(
            pdfFontFor('"FormsBundledInter", system-ui, sans-serif')
        ).toEqual({ key: 'inter', substituted: false });
    });

    it('substitutes by kind when the font cannot be embedded', () => {
        expect(pdfFontFor('system-ui, -apple-system, sans-serif').key).toBe(
            'inter'
        );
        expect(pdfFontFor('"Brand Upload", Georgia, serif').key).toBe(
            'notoSerif'
        );
        expect(pdfFontFor('"Mine", ui-monospace, monospace').key).toBe(
            'ibmPlexMono'
        );
        expect(pdfFontFor(undefined).substituted).toBe(true);
    });

    it('every bundled family has TrueType files in formPdfFonts', () => {
        const root = path.resolve(
            __dirname,
            '../../../staticresources/formPdfFonts'
        );
        for (const key of Object.keys(BUNDLED_FONTS)) {
            const files = pdfFontFiles(key);
            expect(fs.existsSync(path.join(root, files.regular))).toBe(true);
            expect(fs.existsSync(path.join(root, files.bold))).toBe(true);
        }
    });

    it('a variable family gets real 400 and 700 instances', () => {
        expect(pdfFontFiles('inter')).toEqual({
            regular: 'inter/Inter-latin-wght-400.ttf',
            bold: 'inter/Inter-latin-wght-700.ttf'
        });
        expect(pdfFontFiles('nope')).toBeNull();
    });
});
