import { createElement } from 'lwc';
import FinalBrandInputs from 'c/finalBrandInputs';
import { readImagePixels } from 'c/finalBrandColors';

// The "Your brand" starting point of the theme dialog. These are the old
// "Create from your brand" dialog's input tests (PR 398-403), moved with the
// inputs (IMPL_PLAN_THEME_CREATOR); saving, uploading and the preview are
// tested on finalThemeEditor now.

jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);
// The canvas work needs a real browser; the ranking is the real one.
jest.mock('c/finalBrandColors', () => {
    const actual = jest.requireActual('c/finalBrandColors');
    return {
        ...actual,
        readImagePixels: jest.fn(),
        logoForUpload: jest.fn((d) => Promise.resolve(d))
    };
});

const flush = () => new Promise((r) => setTimeout(r, 0));

function px(hex, n) {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Array.from({ length: n }, () => [...v, 255]).flat();
}

const twoColorLogo = () => [
    ...px('#ffffff', 400),
    ...px('#e11d48', 300),
    ...px('#1e3a8a', 200),
    ...px('#16a34a', 100)
];

async function mount(props = {}) {
    const el = createElement('c-final-brand-inputs', { is: FinalBrandInputs });
    Object.assign(el, props);
    el.brandEvents = [];
    el.logoEvents = [];
    el.addEventListener('brandchange', (e) => el.brandEvents.push(e.detail));
    el.addEventListener('logochange', (e) => el.logoEvents.push(e.detail));
    document.body.appendChild(el);
    await flush();
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const lastBrand = (el) => el.brandEvents[el.brandEvents.length - 1];
const roles = (el) =>
    qa(el, '.bd-swatch-role').map((r) => r.textContent.trim());
// the selected style card is drawn from the recipe the dialog will build
const brandOf = (el) =>
    qa(el, '.bd-styles c-final-theme-card').find((c) => c.selected).themeProps;

async function typeHex(el, value, { leave = true } = {}) {
    const hex = q(el, '.bd-hex');
    hex.value = value;
    hex.dispatchEvent(new CustomEvent('input'));
    if (leave) {
        hex.dispatchEvent(new CustomEvent('change'));
    }
    await flush();
}

async function typeHex2(el, value, { leave = true } = {}) {
    const hex = q(el, '.bd-hex2');
    hex.value = value;
    hex.dispatchEvent(new CustomEvent('input'));
    if (leave) {
        hex.dispatchEvent(new CustomEvent('change'));
    }
    await flush();
}

async function uploadLogo(el, pixels) {
    readImagePixels.mockResolvedValueOnce(pixels);
    const input = q(el, '.bd-file');
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true
    });
    input.dispatchEvent(new CustomEvent('change'));
    await new Promise((r) => setTimeout(r, 20));
    await flush();
}

describe('c-final-brand-inputs', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('starts empty: no style cards until there is a color, and no change event', async () => {
        const el = await mount();
        expect(qa(el, '.bd-styles c-final-theme-card')).toHaveLength(0);
        expect(el.brandEvents).toHaveLength(0);
    });

    it('reopening a brand theme starts from its colors and style, without a change event', async () => {
        const el = await mount({
            initialColor: '#E11D48',
            initialSecond: '#1e3a8a',
            initialStyle: 'dark'
        });
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
        expect(q(el, '.bd-hex2').value).toBe('#1e3a8a');
        expect(brandOf(el).brand.style).toBe('dark');
        expect(el.brandEvents).toHaveLength(0);
    });

    it('a hex color draws three style cards and reports the brand', async () => {
        const el = await mount();
        await typeHex(el, '#1E3A8A');
        const cards = qa(el, '.bd-styles c-final-theme-card');
        expect(cards.map((c) => c.label)).toEqual([
            'Clean',
            'Bold header',
            'Dark'
        ]);
        cards.forEach((c) => expect(c.themeProps.brand.color).toBe('#1e3a8a'));
        cards.forEach((c) => expect(c.maxWidth).toBe('full'));
        expect(lastBrand(el)).toEqual({
            color: '#1e3a8a',
            second: '',
            style: 'clean'
        });
    });

    it('picking a style reports it', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        qa(el, '.bd-styles c-final-theme-card')[2].dispatchEvent(
            new CustomEvent('select')
        );
        await flush();
        expect(lastBrand(el).style).toBe('dark');
        expect(brandOf(el).brand.style).toBe('dark');
    });

    it('the style cards preview the theme’s fonts', async () => {
        const fonts = { pairing: 'editorialSerif' };
        const el = await mount({ fonts });
        await typeHex(el, '#1e3a8a');
        qa(el, '.bd-styles c-final-theme-card').forEach((c) =>
            expect(c.themeProps.fonts).toEqual(fonts)
        );
    });

    it('a bad hex says so and draws nothing', async () => {
        const el = await mount();
        await typeHex(el, '#12');
        expect(q(el, '.bd-color-err').textContent).toContain('hex color');
        expect(q(el, '.bd-hex').getAttribute('aria-invalid')).toBe('true');
        expect(qa(el, '.bd-styles c-final-theme-card')).toHaveLength(0);
    });

    it('validate(): no color, a bad Main or a bad Second blocks, and says why', async () => {
        const el = await mount();
        expect(el.validate()).toBe(false);
        await flush();
        expect(q(el, '.bd-color-err').textContent).toContain(
            'Pick a main color first'
        );
        await typeHex(el, '#e11d48');
        expect(el.validate()).toBe(true);
        await typeHex(el, '#zz');
        expect(el.validate()).toBe(false);
        await typeHex(el, '#e11d48');
        await typeHex2(el, '#12');
        expect(el.validate()).toBe(false);
        await typeHex2(el, '');
        expect(el.validate()).toBe(true);
    });

    it('a logo suggests its colors and the first one is Main', async () => {
        const el = await mount();
        await uploadLogo(el, [
            ...px('#ffffff', 500),
            ...px('#e11d48', 300),
            ...px('#1e3a8a', 200)
        ]);
        const swatches = qa(el, '.bd-swatch');
        expect(swatches.map((s) => s.title)).toEqual(['#e11d48', '#1e3a8a']);
        expect(swatches[0].getAttribute('aria-pressed')).toBe('true');
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
        expect(el.logoEvents[el.logoEvents.length - 1]).toMatchObject({
            fileName: 'logo.png',
            useAsLogo: true
        });
        swatches[1].click();
        await flush();
        // the next tap adds a second color, Main stays
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
        expect(q(el, '.bd-hex2').value).toBe('#1e3a8a');
    });

    it('a black-only logo says there is nothing to suggest', async () => {
        const el = await mount();
        await uploadLogo(el, px('#000000', 500));
        expect(qa(el, '.bd-swatch')).toHaveLength(0);
        expect(el.shadowRoot.textContent).toContain('No clear colors');
    });

    it('refuses an unsupported file type', async () => {
        const el = await mount();
        const input = q(el, '.bd-file');
        const file = new File(['x'], 'logo.svg', { type: 'image/svg+xml' });
        Object.defineProperty(input, 'files', {
            value: [file],
            configurable: true
        });
        input.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(q(el, '.bd-error').textContent).toContain(
            'PNG, JPG, GIF or WebP'
        );
        expect(readImagePixels).not.toHaveBeenCalled();
    });

    it('typing a color key by key never rewrites the field (PR 402 B1)', async () => {
        const el = await mount();
        const hex = q(el, '.bd-hex');
        let text = '';
        for (const ch of '#1e3a8a') {
            text += ch;
            hex.value = text;
            hex.dispatchEvent(new CustomEvent('input'));
            // eslint-disable-next-line no-await-in-loop
            await flush();
            expect(hex.value).toBe(text);
            expect(q(el, '.bd-color-err').textContent.trim()).toBe('');
        }
        expect(lastBrand(el).color).toBe('#1e3a8a');
    });

    it('a 3-digit color counts once you leave the box', async () => {
        const el = await mount();
        await typeHex(el, '#f00', { leave: false });
        expect(el.brandEvents).toHaveLength(0);
        q(el, '.bd-hex').dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(q(el, '.bd-hex').value).toBe('#ff0000');
        expect(lastBrand(el).color).toBe('#ff0000');
    });

    it('an existing logo: the option replaces it and starts unticked', async () => {
        const el = await mount({ currentLogoUrl: '/sfc/old' });
        await uploadLogo(el, px('#e11d48', 500));
        expect(q(el, '.bd-check').textContent).toContain(
            'Replace this form’s logo'
        );
        expect(q(el, '.bd-check input').checked).toBe(false);
        expect(el.logoEvents[el.logoEvents.length - 1].useAsLogo).toBe(false);
    });

    it('a text-only header says the logo will not show', async () => {
        const el = await mount({ headerArrangement: 'textOnly' });
        await uploadLogo(el, px('#e11d48', 500));
        expect(el.shadowRoot.textContent).toContain('show text only');
    });

    it('a second logo moves a color taken from the first; Remove clears it', async () => {
        const el = await mount();
        await uploadLogo(el, px('#e11d48', 500));
        await uploadLogo(el, px('#16a34a', 500));
        expect(q(el, '.bd-hex').value).toBe('#16a34a');
        q(el, '.bd-link').click();
        await flush();
        expect(q(el, '.bd-logo')).toBeNull();
        expect(qa(el, '.bd-swatch')).toHaveLength(0);
        expect(el.logoEvents[el.logoEvents.length - 1].dataUrl).toBeNull();
    });

    it('a color typed by hand stays when a logo arrives', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        await uploadLogo(el, px('#e11d48', 500));
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
    });

    it('taps: first is Main, next is Second, a third replaces Second', async () => {
        const el = await mount();
        await uploadLogo(el, twoColorLogo());
        // the logo picks Main only, and says how to add Second
        expect(roles(el)).toEqual(['Main', '', '']);
        expect(q(el, '.bd-second-hint').textContent).toContain(
            'Pick another logo color'
        );
        expect(q(el, '.bd-hex2').value).toBe('');
        let sw = qa(el, '.bd-swatch');
        sw[1].click();
        await flush();
        expect(roles(el)).toEqual(['Main', 'Second', '']);
        expect(q(el, '.bd-hex2').value).toBe('#1e3a8a');
        expect(q(el, '.bd-second-hint').textContent).toContain(
            'Pick a chosen color again'
        );
        sw = qa(el, '.bd-swatch');
        expect(sw[1].getAttribute('aria-pressed')).toBe('true');
        expect(sw[1].getAttribute('aria-label')).toBe(
            '#1e3a8a, second color. Press to remove'
        );
        expect(sw[0].getAttribute('aria-label')).toBe(
            '#e11d48, main color. Press to remove'
        );
        expect(sw[2].getAttribute('aria-label')).toBe(
            'Use #16a34a as second color, replacing the current one'
        );
        sw[2].click();
        await flush();
        expect(roles(el)).toEqual(['Main', '', 'Second']);
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
    });

    it('tapping a chosen swatch unpicks it; unpicking Main promotes Second', async () => {
        const el = await mount();
        await uploadLogo(el, twoColorLogo());
        qa(el, '.bd-swatch')[1].click();
        await flush();
        qa(el, '.bd-swatch')[0].click(); // unpick Main
        await flush();
        expect(roles(el)).toEqual(['', 'Main', '']);
        expect(q(el, '.bd-sr').textContent).toContain(
            'Main color is now #1e3a8a'
        );
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
        expect(q(el, '.bd-hex2').value).toBe('');
        qa(el, '.bd-swatch')[2].click(); // a new Second
        await flush();
        qa(el, '.bd-swatch')[2].click(); // and unpicked again
        await flush();
        expect(roles(el)).toEqual(['', 'Main', '']);
        qa(el, '.bd-swatch')[1].click(); // unpick the only color
        await flush();
        expect(roles(el)).toEqual(['', '', '']);
        expect(qa(el, '.bd-styles c-final-theme-card')).toHaveLength(0);
        qa(el, '.bd-swatch')[2].click(); // nothing chosen: the tap is Main
        await flush();
        expect(roles(el)).toEqual(['', '', 'Main']);
    });

    it('Second paints the highlights; Main keeps the button', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        expect(brandOf(el).brand.secondColor).toBeUndefined();
        await typeHex2(el, '#1e3a8a');
        const after = brandOf(el);
        expect(after.palette.submitBg).toBe('#e11d48');
        expect(after.palette.accent).toBe('#1e3a8a');
        expect(after.brand.secondColor).toBe('#1e3a8a');
        qa(el, '.bd-styles c-final-theme-card').forEach((c) =>
            expect(c.themeProps.brand.secondColor).toBe('#1e3a8a')
        );
        expect(lastBrand(el)).toEqual({
            color: '#e11d48',
            second: '#1e3a8a',
            style: 'clean'
        });
    });

    it('the second hex box: live on 6 digits, emptying removes it, junk says so', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        await typeHex2(el, '#1e3a8a', { leave: false });
        expect(lastBrand(el).second).toBe('#1e3a8a');
        await typeHex2(el, '');
        expect(lastBrand(el).second).toBe('');
        await typeHex2(el, '#12');
        expect(q(el, '.bd-second-err').textContent).toContain('hex color');
        expect(q(el, '.bd-hex2').getAttribute('aria-invalid')).toBe('true');
        await typeHex2(el, '#0f0');
        expect(lastBrand(el).second).toBe('#00ff00');
    });

    it('Swap trades the two; Clear removes Second', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        expect(q(el, '.bd-swap')).toBeNull();
        expect(q(el, '.bd-clear')).toBeNull();
        await typeHex2(el, '#1e3a8a');
        q(el, '.bd-swap').click();
        await flush();
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
        expect(q(el, '.bd-hex2').value).toBe('#e11d48');
        expect(brandOf(el).palette.submitBg).toBe('#1e3a8a');
        q(el, '.bd-clear').click();
        await flush();
        expect(q(el, '.bd-hex2').value).toBe('');
        expect(brandOf(el).brand.secondColor).toBeUndefined();
        expect(q(el, '.bd-swap')).toBeNull();
    });

    it('a new logo drops a Second tapped on the old one, keeps a typed one', async () => {
        const el = await mount();
        await uploadLogo(el, twoColorLogo());
        qa(el, '.bd-swatch')[1].click();
        await flush();
        await uploadLogo(el, [...px('#16a34a', 300), ...px('#7c3aed', 200)]);
        expect(q(el, '.bd-hex2').value).toBe('');
        await typeHex2(el, '#f59e0b');
        await uploadLogo(el, twoColorLogo());
        expect(q(el, '.bd-hex2').value).toBe('#f59e0b');
    });

    it('a Second equal to Main says so', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        await typeHex2(el, '#e11d48');
        expect(q(el, '.bd-same').textContent).toContain('Same as your main');
    });

    it('Swap is announced', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        await typeHex2(el, '#1e3a8a');
        q(el, '.bd-swap').click();
        await flush();
        expect(q(el, '.bd-sr').textContent).toContain(
            'Main color is now #1e3a8a, second color #e11d48'
        );
    });
});
