import { createElement } from 'lwc';
import FinalBrandDialog from 'c/finalBrandDialog';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import orgName from '@salesforce/apex/FinalThemeController.orgName';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
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
// The canvas read needs a real browser; the ranking is the real one.
jest.mock('c/finalBrandColors', () => {
    const actual = jest.requireActual('c/finalBrandColors');
    return { ...actual, readImagePixels: jest.fn() };
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

async function typeHex(el, value) {
    const hex = q(el, '.bd-hex');
    hex.value = value;
    hex.dispatchEvent(new CustomEvent('input'));
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
        expect(q(el, '.bd-error').textContent).toContain('hex colour');
        expect(q(el, '.bd-empty')).not.toBeNull();
    });

    it('a light colour warns that the Submit button may not stand out', async () => {
        const el = await mount();
        await typeHex(el, '#fafafa');
        expect(q(el, '.bd-warn').textContent).toContain('Submit button');
        await typeHex(el, '#1e3a8a');
        expect(q(el, '.bd-warn')).toBeNull();
    });

    it('a logo suggests its colours and the first one is taken', async () => {
        const el = await mount();
        await uploadLogo(el, [
            ...px('#ffffff', 500),
            ...px('#e11d48', 300),
            ...px('#1e3a8a', 200)
        ]);
        const swatches = qa(el, '.bd-swatch');
        expect(swatches.map((s) => s.title)).toEqual(['#e11d48', '#1e3a8a']);
        expect(swatches[0].getAttribute('aria-checked')).toBe('true');
        expect(q(el, '.bd-hex').value).toBe('#e11d48');
        swatches[1].click();
        await flush();
        expect(q(el, '.bd-hex').value).toBe('#1e3a8a');
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
        expect(q(el, '.bd-error').textContent).toContain('Pick a colour');
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
        expect(q(el, '.bd-preview .bd-error').textContent).toBe('Name taken');
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
});
