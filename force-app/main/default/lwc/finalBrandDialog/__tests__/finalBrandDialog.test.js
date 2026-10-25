import { createElement } from 'lwc';
import FinalBrandDialog from 'c/finalBrandDialog';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import orgName from '@salesforce/apex/FinalThemeController.orgName';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';
import { readImagePixels } from 'c/finalBrandColors';

jest.mock(
    '@salesforce/apex/FinalThemeController.saveCustomTheme',
    () => ({ default: jest.fn(() => Promise.resolve('a0AXX0000009')) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.orgName',
    () => ({ default: jest.fn(() => Promise.resolve('Acme')) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.uploadImage',
    () => ({
        default: jest.fn(() =>
            Promise.resolve({ url: '/sfc/logo', contentVersionId: '068XX01' })
        )
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalAssetController.deleteImage',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
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

async function mount(props = {}) {
    const el = createElement('c-final-brand-dialog', { is: FinalBrandDialog });
    Object.assign(el, { formId: 'a05XX0000001', layout: 'stepper', ...props });
    document.body.appendChild(el);
    await flush();
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

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

async function confirm(el) {
    q(el, 'c-final-studio-dialog').dispatchEvent(new CustomEvent('confirm'));
    await flush();
    await flush();
}

describe('c-final-brand-dialog', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('starts empty, with the name "<Org> brand"', async () => {
        const el = await mount();
        expect(orgName).toHaveBeenCalled();
        expect(q(el, '.bd-name').value).toBe('Acme brand');
        expect(q(el, '.bd-empty')).not.toBeNull();
        expect(qa(el, '.bd-styles c-final-theme-card')).toHaveLength(0);
    });

    it('a hex colour draws three style cards and a preview in the form’s layout', async () => {
        const el = await mount();
        await typeHex(el, '#1E3A8A');
        const cards = qa(el, '.bd-styles c-final-theme-card');
        expect(cards.map((c) => c.label)).toEqual([
            'Clean',
            'Bold header',
            'Dark'
        ]);
        cards.forEach((c) => expect(c.themeProps.brand.color).toBe('#1e3a8a'));
        const preview = q(el, '.bd-preview c-final-theme-card');
        expect(preview.layout).toBe('stepper');
        expect(preview.themeProps.brand.style).toBe('clean');
    });

    it('picking a style changes the preview recipe', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        const dark = qa(el, '.bd-styles c-final-theme-card')[2];
        dark.dispatchEvent(new CustomEvent('select'));
        await flush();
        expect(
            q(el, '.bd-preview c-final-theme-card').themeProps.brand.style
        ).toBe('dark');
    });

    it('a bad hex says so and draws nothing', async () => {
        const el = await mount();
        await typeHex(el, '#12');
        expect(q(el, '.bd-color-err').textContent).toContain('hex colour');
        expect(q(el, '.bd-hex').getAttribute('aria-invalid')).toBe('true');
        expect(q(el, '.bd-empty')).not.toBeNull();
    });

    it('a light colour warns that the Submit button may not stand out', async () => {
        const el = await mount();
        await typeHex(el, '#fafafa');
        const warn = q(el, '.bd-warn').textContent;
        expect(warn).toContain('Submit button');
        // only a style that really fixes it is named (Bold header does not)
        expect(warn).toContain('Try Dark');
        expect(warn).not.toContain('Bold header');
        expect(el.shadowRoot.textContent).toContain(
            'Text and focus outlines are checked'
        );
        await typeHex(el, '#1e3a8a');
        expect(q(el, '.bd-warn').textContent.trim()).toBe('');
    });

    it('a logo suggests its colours and the first one is Main', async () => {
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
        swatches[1].click();
        await flush();
        // the next tap adds a second colour, Main stays
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
        expect(q(el, '.bd-hex2').value).toBe('#1e3a8a');
    });

    it('a black-only logo says there is nothing to suggest', async () => {
        const el = await mount();
        await uploadLogo(el, px('#000000', 500));
        expect(qa(el, '.bd-swatch')).toHaveLength(0);
        expect(el.shadowRoot.textContent).toContain('No clear colours');
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

    it('Save uploads the logo, saves the recipe as an org theme and reports both', async () => {
        const el = await mount();
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await uploadLogo(el, [...px('#ffffff', 500), ...px('#e11d48', 500)]);
        const picker = q(el, 'c-final-font-picker');
        picker.dispatchEvent(
            new CustomEvent('fontchange', {
                detail: { patch: { fonts: { pairing: 'editorialSerif' } } }
            })
        );
        await flush();
        await confirm(el);
        expect(uploadImage).toHaveBeenCalledWith(
            expect.objectContaining({
                fileName: 'logo.png',
                formId: 'a05XX0000001'
            })
        );
        const args = saveCustomTheme.mock.calls[0][0];
        expect(args.themeId).toBeNull();
        expect(args.name).toBe('Acme brand');
        const recipe = JSON.parse(args.themeJson);
        expect(recipe.brand).toEqual({ color: '#e11d48', style: 'clean' });
        expect(recipe.fonts).toEqual({ pairing: 'editorialSerif' });
        expect(saved.mock.calls[0][0].detail).toEqual({
            id: 'a0AXX0000009',
            name: 'Acme brand',
            logo: { url: '/sfc/logo', versionId: '068XX01' }
        });
    });

    it('unticking "use as logo" saves without uploading', async () => {
        const el = await mount();
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await uploadLogo(el, px('#e11d48', 500));
        const box = q(el, '.bd-check input');
        box.checked = false;
        box.dispatchEvent(new CustomEvent('change'));
        await confirm(el);
        expect(uploadImage).not.toHaveBeenCalled();
        expect(saved.mock.calls[0][0].detail.logo).toBeNull();
    });

    it('Save without a colour explains instead of saving', async () => {
        const el = await mount();
        await confirm(el);
        expect(saveCustomTheme).not.toHaveBeenCalled();
        expect(q(el, '.bd-color-err').textContent).toContain('Pick a colour');
    });

    it('a failed save shows the server message and emits nothing', async () => {
        saveCustomTheme.mockRejectedValueOnce({
            body: { message: 'Name taken' }
        });
        const el = await mount();
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await typeHex(el, '#1e3a8a');
        await confirm(el);
        expect(saved).not.toHaveBeenCalled();
        expect(q(el, '.bd-save-error').textContent).toContain(
            'The theme couldn’t be saved: Name taken'
        );
    });

    it('dismissing cancels', async () => {
        const el = await mount();
        const cancel = jest.fn();
        el.addEventListener('cancel', cancel);
        q(el, 'c-final-studio-dialog').dispatchEvent(
            new CustomEvent('dismiss')
        );
        expect(cancel).toHaveBeenCalled();
    });

    it('typing a colour key by key never rewrites the field (PR 402 B1)', async () => {
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
        expect(
            q(el, '.bd-preview c-final-theme-card').themeProps.brand.color
        ).toBe('#1e3a8a');
    });

    it('a 3-digit colour counts once you leave the box', async () => {
        const el = await mount();
        await typeHex(el, '#f00', { leave: false });
        expect(q(el, '.bd-empty')).not.toBeNull();
        q(el, '.bd-hex').dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(q(el, '.bd-hex').value).toBe('#ff0000');
    });

    it('the preview is a picture, not a control', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        expect(q(el, '.bd-preview c-final-theme-card').picture).toBe(true);
    });

    it('a retry after a failed save reuses the uploaded logo', async () => {
        saveCustomTheme.mockRejectedValueOnce({ body: { message: 'Busy' } });
        const el = await mount();
        await uploadLogo(el, px('#e11d48', 500));
        await confirm(el);
        await confirm(el);
        expect(uploadImage).toHaveBeenCalledTimes(1);
        expect(saveCustomTheme).toHaveBeenCalledTimes(2);
    });

    it('Cancel after an upload that was never saved removes the file', async () => {
        saveCustomTheme.mockRejectedValueOnce({ body: { message: 'Busy' } });
        const el = await mount();
        await uploadLogo(el, px('#e11d48', 500));
        await confirm(el);
        q(el, 'c-final-studio-dialog').dispatchEvent(
            new CustomEvent('dismiss')
        );
        expect(deleteImage).toHaveBeenCalledWith({
            contentVersionId: '068XX01',
            formId: 'a05XX0000001'
        });
    });

    it('busy while saving, and a second click shows no false error', async () => {
        let release;
        saveCustomTheme.mockImplementationOnce(
            () =>
                new Promise((r) => {
                    release = r;
                })
        );
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        const shell = q(el, 'c-final-studio-dialog');
        shell.dispatchEvent(new CustomEvent('confirm'));
        await flush();
        expect(shell.busy).toBe(true);
        shell.dispatchEvent(new CustomEvent('confirm'));
        await flush();
        expect(q(el, '.bd-name-err').textContent.trim()).toBe('');
        release('a0AXX0000010');
        await flush();
        await flush();
        expect(shell.busy).toBe(false);
    });

    it('an existing logo: the option replaces it and starts unticked', async () => {
        const el = await mount({ currentLogoUrl: '/sfc/old' });
        await uploadLogo(el, px('#e11d48', 500));
        expect(q(el, '.bd-check').textContent).toContain(
            'Replace this form’s logo'
        );
        expect(q(el, '.bd-check input').checked).toBe(false);
    });

    it('a text-only header says the logo will not show', async () => {
        const el = await mount({ headerArrangement: 'textOnly' });
        await uploadLogo(el, px('#e11d48', 500));
        expect(el.shadowRoot.textContent).toContain('show text only');
    });

    it('a second logo moves a colour taken from the first; Remove clears it', async () => {
        const el = await mount();
        await uploadLogo(el, px('#e11d48', 500));
        await uploadLogo(el, px('#16a34a', 500));
        expect(q(el, '.bd-hex').value).toBe('#16a34a');
        q(el, '.bd-link').click();
        await flush();
        expect(q(el, '.bd-logo')).toBeNull();
        expect(qa(el, '.bd-swatch')).toHaveLength(0);
    });

    it('a colour typed by hand stays when a logo arrives', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        await uploadLogo(el, px('#e11d48', 500));
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
    });

    it('an upload failure explains that nothing was saved', async () => {
        uploadImage.mockRejectedValueOnce({
            body: { message: 'Disconnected or Canceled' }
        });
        const el = await mount();
        await uploadLogo(el, px('#e11d48', 500));
        await confirm(el);
        expect(q(el, '.bd-save-error').textContent).toContain(
            'Your logo couldn’t be uploaded'
        );
        expect(saveCustomTheme).not.toHaveBeenCalled();
    });

    // ------------------------------------------- second colour (§B.4, B3)

    const twoColourLogo = () => [
        ...px('#ffffff', 500),
        ...px('#e11d48', 300),
        ...px('#1e3a8a', 200),
        ...px('#16a34a', 150)
    ];
    const roles = (el) => qa(el, '.bd-swatch').map((s) => s.textContent.trim());
    const brandOf = (el) => q(el, '.bd-preview c-final-theme-card').themeProps;

    it('taps: first is Main, next is Second, a third replaces Second', async () => {
        const el = await mount();
        await uploadLogo(el, twoColourLogo());
        // the logo picks Main only, and says how to add Second
        expect(roles(el)).toEqual(['Main', '', '']);
        expect(q(el, '.bd-second-hint').textContent).toContain(
            'Tap another colour'
        );
        expect(q(el, '.bd-hex2').value).toBe('');
        let sw = qa(el, '.bd-swatch');
        sw[1].click();
        await flush();
        expect(roles(el)).toEqual(['Main', 'Second', '']);
        expect(q(el, '.bd-hex2').value).toBe('#1e3a8a');
        expect(q(el, '.bd-second-hint')).toBeNull();
        sw = qa(el, '.bd-swatch');
        expect(sw[1].getAttribute('aria-pressed')).toBe('true');
        expect(sw[1].getAttribute('aria-label')).toBe('#1e3a8a, second colour');
        expect(sw[0].getAttribute('aria-label')).toBe('#e11d48, main colour');
        sw[2].click();
        await flush();
        expect(roles(el)).toEqual(['Main', '', 'Second']);
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
    });

    it('tapping a chosen swatch unpicks it; unpicking Main promotes Second', async () => {
        const el = await mount();
        await uploadLogo(el, twoColourLogo());
        qa(el, '.bd-swatch')[1].click();
        await flush();
        qa(el, '.bd-swatch')[0].click(); // unpick Main
        await flush();
        expect(roles(el)).toEqual(['', 'Main', '']);
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
        expect(q(el, '.bd-hex2').value).toBe('');
        qa(el, '.bd-swatch')[2].click(); // a new Second
        await flush();
        qa(el, '.bd-swatch')[2].click(); // and unpicked again
        await flush();
        expect(roles(el)).toEqual(['', 'Main', '']);
        qa(el, '.bd-swatch')[1].click(); // unpick the only colour
        await flush();
        expect(roles(el)).toEqual(['', '', '']);
        expect(q(el, '.bd-empty')).not.toBeNull();
        qa(el, '.bd-swatch')[2].click(); // nothing chosen: the tap is Main
        await flush();
        expect(roles(el)).toEqual(['', '', 'Main']);
    });

    it('Second paints the highlights; Main keeps the button', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        const before = brandOf(el);
        expect(before.brand.secondColor).toBeUndefined();
        expect(q(el, '.bd-roles').textContent).toContain(
            'made from your main colour'
        );
        await typeHex2(el, '#1e3a8a');
        const after = brandOf(el);
        expect(after.palette.submitBg).toBe('#e11d48');
        expect(after.palette.accent).toBe('#1e3a8a');
        expect(after.brand.secondColor).toBe('#1e3a8a');
        // the style cards are drawn with both colours too
        qa(el, '.bd-styles c-final-theme-card').forEach((c) =>
            expect(c.themeProps.brand.secondColor).toBe('#1e3a8a')
        );
        const text = q(el, '.bd-roles').textContent;
        expect(text).toContain('Second');
        expect(text).not.toContain('made from your main colour');
    });

    it('a light Second is shaded until it reads, and the preview says so', async () => {
        const el = await mount();
        await typeHex(el, '#1e3a8a');
        await typeHex2(el, '#fde047');
        expect(brandOf(el).palette.accent).not.toBe('#fde047');
        expect(q(el, '.bd-roles').textContent).toContain('adjusted');
    });

    it('the second hex box: live on 6 digits, emptying removes it, junk says so', async () => {
        const el = await mount();
        await typeHex(el, '#e11d48');
        await typeHex2(el, '#1e3a8a', { leave: false });
        expect(brandOf(el).brand.secondColor).toBe('#1e3a8a');
        await typeHex2(el, '');
        expect(brandOf(el).brand.secondColor).toBeUndefined();
        await typeHex2(el, '#12');
        expect(q(el, '.bd-second-err').textContent).toContain('hex colour');
        expect(q(el, '.bd-hex2').getAttribute('aria-invalid')).toBe('true');
        // Save waits until it is fixed or emptied
        await confirm(el);
        expect(saveCustomTheme).not.toHaveBeenCalled();
        await typeHex2(el, '#0f0');
        expect(brandOf(el).brand.secondColor).toBe('#00ff00');
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
        await uploadLogo(el, twoColourLogo());
        qa(el, '.bd-swatch')[1].click();
        await flush();
        await uploadLogo(el, [...px('#16a34a', 300), ...px('#7c3aed', 200)]);
        expect(q(el, '.bd-hex2').value).toBe('');
        await typeHex2(el, '#f59e0b');
        await uploadLogo(el, twoColourLogo());
        expect(q(el, '.bd-hex2').value).toBe('#f59e0b');
    });

    it('Save records both colours in the theme', async () => {
        const el = await mount();
        await uploadLogo(el, twoColourLogo());
        qa(el, '.bd-swatch')[1].click();
        await flush();
        await confirm(el);
        const saved = JSON.parse(saveCustomTheme.mock.calls[0][0].themeJson);
        expect(saved.brand).toEqual({
            color: '#e11d48',
            secondColor: '#1e3a8a',
            style: 'clean'
        });
        expect(saved.palette.submitBg).toBe('#e11d48');
        expect(saved.palette.accent).toBe('#1e3a8a');
    });
});
