import { createElement } from 'lwc';
import FinalThemeEditor from 'c/finalThemeEditor';
import saveCustomTheme from '@salesforce/apex/FinalThemeController.saveCustomTheme';
import getCustomTheme from '@salesforce/apex/FinalThemeController.getCustomTheme';
import uploadImage from '@salesforce/apex/FinalAssetController.uploadImage';
import deleteImage from '@salesforce/apex/FinalAssetController.deleteImage';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import { buildBrandTheme } from 'c/finalBrandTheme';
import { resolveTokens } from 'c/finalThemeEngine';

// The ONE theme dialog (IMPL_PLAN_THEME_CREATOR): theme editor + "Create from
// your brand" merged. The brand dialog's save/upload tests moved here.

jest.mock(
    '@salesforce/apex/FinalThemeController.saveCustomTheme',
    () => ({ default: jest.fn(() => Promise.resolve('a0AXX0000001')) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalThemeController.getCustomTheme',
    () => ({
        default: jest.fn(() =>
            Promise.resolve('{"palette":{"accent":"#111111"}}')
        )
    }),
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
    '@salesforce/apex/FinalAssetController.deleteImage',
    () => ({ default: jest.fn(() => Promise.resolve()) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalFontController.listFonts',
    () => ({ default: jest.fn(() => Promise.resolve([])) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);
jest.mock('c/finalBrandColors', () => {
    const actual = jest.requireActual('c/finalBrandColors');
    return {
        ...actual,
        readImagePixels: jest.fn(),
        logoForUpload: jest.fn((d) => Promise.resolve(d))
    };
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const LOGO = 'data:image/png;base64,AAAA';

async function mount(props = {}) {
    const el = createElement('c-final-theme-editor', { is: FinalThemeEditor });
    Object.assign(el, { formId: 'a05XX0000001', layout: 'stepper' }, props);
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const shell = (el) => q(el, 'c-final-studio-dialog');
const color = (el, path) => q(el, `c-final-color-control[data-path="${path}"]`);
const row = (el, path) => q(el, `.te-crow[data-row="${path}"]`);
const preview = (el) => q(el, '.te-preview c-final-theme-card').themeProps;

async function setName(el, value) {
    const input = q(el, '.te-name');
    input.value = value;
    input.dispatchEvent(new CustomEvent('input'));
    await flush();
}
async function pick(el, path, value) {
    color(el, path).dispatchEvent(
        new CustomEvent('change', { detail: { value } })
    );
    await flush();
}
const gradientRow = (el, path) =>
    q(el, `c-final-gradient-control[data-path="${path}"]`);
async function fill(el, path, solid, gradient = null) {
    gradientRow(el, path).dispatchEvent(
        new CustomEvent('change', { detail: { solid, gradient } })
    );
    await flush();
}
const G = { type: 'linear', angle: 90, start: '#1e3a8a', end: '#0f172a' };

async function start(el, value) {
    q(el, `.te-seg[data-value="${value}"]`).click();
    await flush();
}
async function confirm(el) {
    shell(el).dispatchEvent(new CustomEvent('confirm'));
    await flush();
    await flush();
}
// Types into the real brand inputs, as a person does: they report the
// change, and they are what Save asks to validate.
async function brand(el, { color: main, second }) {
    const inputs = q(el, 'c-final-brand-inputs');
    const type = async (sel, value) => {
        const box = inputs.shadowRoot.querySelector(sel);
        box.value = value;
        box.dispatchEvent(new CustomEvent('input'));
        box.dispatchEvent(new CustomEvent('change'));
        await flush();
    };
    if (main !== undefined) await type('.bd-hex', main);
    if (second !== undefined) await type('.bd-hex2', second);
    await flush();
}
async function logo(el, useAsLogo = true) {
    q(el, 'c-final-brand-inputs').dispatchEvent(
        new CustomEvent('logochange', {
            detail: { dataUrl: LOGO, fileName: 'logo.png', useAsLogo }
        })
    );
    await flush();
}
const savedRecipe = (n = 0) =>
    JSON.parse(saveCustomTheme.mock.calls[n][0].themeJson);

describe('c-final-theme-editor', () => {
    beforeEach(() => jest.clearAllMocks());
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    // ------------------------------------------------------- start from

    it('a new theme starts from a theme: the built-in, in the shared dialog shell', async () => {
        const el = await mount({ startFrom: 'nordic' });
        expect(shell(el).label).toBe('New theme');
        expect(shell(el).confirmLabel).toBe('Create theme');
        expect(q(el, '.te-seg.on').dataset.value).toBe('theme');
        expect(color(el, 'palette.accent').value).toBe(
            getBuiltinTheme('nordic').palette.accent
        );
        expect(preview(el).palette.accent).toBe(
            getBuiltinTheme('nordic').palette.accent
        );
    });

    it('edit opens the saved theme with its name; Save is ready', async () => {
        const el = await mount({
            themeId: 'a0AXX0000001',
            themeName: 'Spring Campaign'
        });
        expect(getCustomTheme).toHaveBeenCalledWith({
            themeId: 'a0AXX0000001'
        });
        expect(shell(el).label).toBe('Edit theme');
        expect(q(el, '.te-name').value).toBe('Spring Campaign');
        expect(color(el, 'palette.accent').value).toBe('#111111');
        await confirm(el);
        expect(saveCustomTheme).toHaveBeenCalledWith(
            expect.objectContaining({
                themeId: 'a0AXX0000001',
                name: 'Spring Campaign'
            })
        );
    });

    it('Save as new saves a copy, never the record', async () => {
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'X' });
        [...qa(el, '.te-btn')]
            .find((b) => b.textContent.trim() === 'Save as new')
            .click();
        await flush();
        expect(saveCustomTheme.mock.calls[0][0].themeId).toBeNull();
    });

    it('an older theme (no starting point saved) opens as saved, and asks before a rebuild', async () => {
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'Old' });
        expect(q(el, '.te-seg.on').dataset.value).toBe('current');
        await start(el, 'theme');
        expect(q(el, '.te-rebuild').textContent).toContain(
            'recalculates every color'
        );
        // Keep as saved changes nothing
        [...qa(el, '.te-rebuild .te-btn')][1].click();
        await flush();
        expect(color(el, 'palette.accent').value).toBe('#111111');
        await start(el, 'theme');
        [...qa(el, '.te-rebuild .te-btn')][0].click();
        await flush();
        expect(q(el, '.te-seg.on').dataset.value).toBe('theme');
        expect(color(el, 'palette.accent').value).toBe(
            getBuiltinTheme('editorialIvory').palette.accent
        );
    });

    it('an older brand theme reopens on Your brand with its colors', async () => {
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify(
                buildBrandTheme({
                    color: '#e11d48',
                    secondColor: '#1e3a8a',
                    style: 'boldHeader'
                })
            )
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'B' });
        expect(q(el, '.te-seg.on').dataset.value).toBe('brand');
        const inputs = q(el, 'c-final-brand-inputs');
        expect(inputs.initialColor).toBe('#e11d48');
        expect(inputs.initialSecond).toBe('#1e3a8a');
        expect(inputs.initialStyle).toBe('boldHeader');
    });

    // ------------------------------------------------- pins (ruling 3)

    it('switching the theme keeps what you changed by hand and recalculates the rest', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.text', '#7a1f1f');
        expect(row(el, 'palette.text').textContent).toContain('Changed by you');
        const select = q(el, '#te-theme') || q(el, '.te-startbox select');
        select.value = 'dracula';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(color(el, 'palette.text').value).toBe('#7a1f1f');
        expect(color(el, 'palette.accent').value).toBe(
            getBuiltinTheme('dracula').palette.accent
        );
    });

    it('Your brand: a new Main recalculates the accent but keeps a hand-set Text', async () => {
        const el = await mount({ startMode: 'brand' });
        expect(q(el, '.te-seg.on').dataset.value).toBe('brand');
        await brand(el, { color: '#e11d48' });
        const firstAccent = color(el, 'palette.accent').value;
        await pick(el, 'palette.text', '#7a1f1f');
        await brand(el, { color: '#16a34a' });
        expect(color(el, 'palette.text').value).toBe('#7a1f1f');
        expect(color(el, 'palette.accent').value).not.toBe(firstAccent);
        expect(preview(el).brand.color).toBe('#16a34a');
    });

    it('Use calculated unpins and brings the starting point’s value back', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.accent', '#7c2d9c');
        row(el, 'palette.accent').querySelector('.te-link').click();
        await flush();
        expect(color(el, 'palette.accent').value).toBe(
            getBuiltinTheme('nordic').palette.accent
        );
        expect(row(el, 'palette.accent').textContent).not.toContain(
            'Changed by you'
        );
    });

    it('pins are saved with the theme and come back when it is reopened', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await setName(el, 'Pinned');
        await pick(el, 'palette.text', '#7a1f1f');
        await confirm(el);
        const saved = savedRecipe();
        expect(saved.authoring).toEqual({
            start: 'theme',
            from: 'nordic',
            pinned: ['palette.text']
        });
        expect(saved.brand).toBeUndefined();
        getCustomTheme.mockResolvedValueOnce(JSON.stringify(saved));
        document.body.removeChild(el);
        const again = await mount({ themeId: 'a0AXX0000001', themeName: 'P' });
        expect(q(again, '.te-seg.on').dataset.value).toBe('theme');
        expect(row(again, 'palette.text').textContent).toContain(
            'Changed by you'
        );
    });

    it('brand is written only for a brand start', async () => {
        const el = await mount({ startMode: 'brand' });
        await brand(el, { color: '#e11d48', second: '#1e3a8a' });
        await setName(el, 'B');
        await confirm(el);
        expect(savedRecipe().brand).toEqual({
            color: '#e11d48',
            secondColor: '#1e3a8a',
            style: 'clean'
        });
        expect(saveCustomTheme.mock.calls[0][0].baseTheme).toBe('nordic');
        await start(el, 'theme');
        await confirm(el);
        expect(savedRecipe(1).brand).toBeUndefined();
    });

    // ----------------------------------------------- 18 colors (ruling 5)

    it('shows all 18 colors; an unset one is Automatic and saving writes nothing for it', async () => {
        const el = await mount({ startFrom: 'nordic' });
        expect(qa(el, '.te-crow')).toHaveLength(18);
        const auto = qa(el, '.te-crow').find((r) =>
            r.textContent.includes('Automatic')
        );
        expect(auto).toBeTruthy();
        const path = auto.dataset.row;
        await setName(el, 'N');
        await confirm(el);
        const saved = savedRecipe();
        const [group, key] = path.split('.');
        expect((saved[group] || {})[key]).toBeUndefined();
    });

    // ------------------------------------------------ readability (ruling 4)

    it('a hard-to-read color is flagged in plain words; Save still works', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.textWeak', '#d4d6da');
        const box = q(el, '.te-readable');
        expect(box.classList).toContain('te-readable--bad');
        expect(box.textContent).toMatch(
            /Muted text is hard to read on .*: \d+\.\d : 1, needs 4\.5 : 1\./
        );
        expect(row(el, 'palette.textWeak').textContent).toContain(
            'Hard to read'
        );
        await setName(el, 'Still saves');
        await confirm(el);
        expect(saveCustomTheme).toHaveBeenCalled();
    });

    it('the pill names its background, jumps to Fix for me, and the row says it out loud', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.textWeak', '#d4d6da');
        const pill = row(el, 'palette.textWeak').querySelector('.te-flag');
        expect(pill.title).toMatch(/^on /);
        expect(pill.textContent).toContain('Go to Fix for me');
        pill.click();
        await flush();
        expect(el.shadowRoot.activeElement).toBe(q(el, '.te-fix'));
        const label = row(el, 'palette.textWeak').getAttribute('aria-label');
        expect(label).toBe('Muted text, hard to read, changed by you');
        // one status line, not the whole box, is read out
        expect(q(el, '.te-readable').getAttribute('aria-live')).toBeNull();
        expect(q(el, '[role="status"]').textContent.trim()).toMatch(
            /^\d colors? needs? attention\.$/
        );
    });

    it('Accent, Text and Muted text keep their live contrast badge', async () => {
        const el = await mount({ startFrom: 'nordic' });
        const accent = color(el, 'palette.accent');
        expect(accent.subject).toBe('Button labels');
        expect(accent.contrastWith).toBeTruthy();
        expect(color(el, 'palette.text').subject).toBe('Body text');
        expect(color(el, 'palette.textWeak').subject).toBe('Muted text');
        expect(color(el, 'palette.textWeak').contrastWith).toBeTruthy();
        // the other rows have no badge, as before
        expect(color(el, 'palette.borderColor').subject).toBeUndefined();
    });

    it('a light brand colour: the tip names only the styles that fix the button (not Bold header)', async () => {
        const el = await mount({ startMode: 'brand' });
        await brand(el, { color: '#fafafa' });
        const note = q(el, '.te-note').textContent;
        expect(note).toContain('Submit button');
        expect(note).toContain('Try Dark');
        expect(note).not.toContain('Bold header');
        await brand(el, { color: '#1e3a8a' });
        expect(q(el, '.te-note').textContent.trim()).toBe('');
    });

    it('the preview says where the theme starts from', async () => {
        const el = await mount({ startFrom: 'nordic' });
        expect(q(el, '.te-preview c-final-theme-card').description).toBe(
            'From Nordic Minimalist'
        );
        await start(el, 'brand');
        expect(q(el, '.te-preview c-final-theme-card').description).toBe(
            'From your brand'
        );
    });

    it('Fix for me moves the failing color, turns the box green and pins it', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.textWeak', '#d4d6da');
        q(el, '.te-fix').click();
        await flush();
        expect(q(el, '.te-readable').classList).toContain('te-readable--ok');
        expect(color(el, 'palette.textWeak').value).not.toBe('#d4d6da');
        expect(row(el, 'palette.textWeak').textContent).toContain(
            'Changed by you'
        );
    });

    it('what Fix for me can’t fix stays listed with the best ratio it found', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await fill(el, 'palette.pageBg', '#595959');
        await fill(el, 'palette.contentBg', '#ffffff');
        q(el, '.te-fix').click();
        await flush();
        const text = q(el, '.te-unfixed').textContent;
        expect(text).toContain('Couldn’t fix automatically');
        expect(text).toContain('best found');
        expect(q(el, '.te-readable').classList).toContain('te-readable--bad');
    });

    it('a passing theme with a gradient says it was sampled, a solid one says everywhere', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await pick(el, 'palette.textWeak', '#d4d6da');
        q(el, '.te-fix').click();
        await flush();
        expect(q(el, '.te-readable').textContent).toContain(
            'Readable everywhere'
        );
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...getBuiltinTheme('nordic'),
                palette: {
                    ...getBuiltinTheme('nordic').palette,
                    headerBgGradient: { start: '#1e3a8a', end: '#0f172a' },
                    headerText: '#ffffff',
                    headerTextWeak: '#e2e8f0'
                }
            })
        );
        document.body.removeChild(el);
        const g = await mount({ themeId: 'a0AXX0000001', themeName: 'G' });
        if (q(g, '.te-fix')) {
            q(g, '.te-fix').click();
            await flush();
        }
        expect(q(g, '.te-readable').classList).toContain('te-readable--ok');
        expect(q(g, '.te-readable').textContent).toContain(
            'Readable at every point we sampled'
        );
    });

    it('a theme with a page image is never called readable everywhere', async () => {
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...getBuiltinTheme('nordic'),
                pageImage: { url: 'https://example.com/a.jpg' }
            })
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'I' });
        const box = q(el, '.te-readable');
        expect(box.classList).not.toContain('te-readable--ok');
        expect(box.textContent).toContain('Not checked');
        expect(box.textContent).toContain('page image');
    });

    // ------------------------------- gradients (IMPL_PLAN_THEME_GRADIENTS)

    it('Page, Panel and Header fill get the gradient control; the other 15 stay color controls', async () => {
        const el = await mount({ startFrom: 'nordic' });
        // Nordic's header is see-through, so Header fill shows None instead
        expect(getBuiltinTheme('nordic').palette.headerBg).toBe('transparent');
        expect(qa(el, '.te-crow c-final-gradient-control')).toHaveLength(2);
        expect(
            row(el, 'palette.headerBg').querySelector('.te-none')
        ).not.toBeNull();
        expect(qa(el, '.te-crow c-final-color-control')).toHaveLength(15);
        ['palette.pageBg', 'palette.contentBg'].forEach((p) =>
            expect(gradientRow(el, p)).not.toBeNull()
        );
    });

    it('turning a gradient on writes both halves, pins both, and reaches the preview', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await fill(el, 'palette.pageBg', '#eef2ff', G);
        expect(preview(el).palette.pageBgGradient).toEqual(G);
        expect(preview(el).palette.pageBg).toBe('#eef2ff');
        expect(gradientRow(el, 'palette.pageBg').gradient).toEqual(G);
        await setName(el, 'Grad');
        await confirm(el);
        expect(savedRecipe().authoring.pinned).toEqual(
            expect.arrayContaining(['palette.pageBg', 'palette.pageBgGradient'])
        );
    });

    it('Solid writes null for the gradient, and a rebuild from a gradient theme keeps it off', async () => {
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...getBuiltinTheme('nordic'),
                palette: {
                    ...getBuiltinTheme('nordic').palette,
                    headerBgGradient: G
                },
                authoring: { start: 'theme', from: 'nordic', pinned: [] }
            })
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'H' });
        expect(gradientRow(el, 'palette.headerBg').gradient).toEqual(G);
        await fill(el, 'palette.headerBg', '#123456', null);
        expect(preview(el).palette.headerBgGradient).toBeNull();
        const select = q(el, '.te-startbox select');
        select.value = 'dracula';
        select.dispatchEvent(new CustomEvent('change'));
        await flush();
        expect(preview(el).palette.headerBgGradient).toBeNull();
        expect(preview(el).palette.headerBg).toBe('#123456');
    });

    it('Use calculated brings both halves back and unpins both', async () => {
        const el = await mount({ startFrom: 'nordic' });
        const before = preview(el).palette.contentBg;
        await fill(el, 'palette.contentBg', '#fafafa', G);
        row(el, 'palette.contentBg').querySelector('.te-pin .te-link').click();
        await flush();
        expect(preview(el).palette.contentBg).toBe(before);
        expect(preview(el).palette.contentBgGradient).toBeUndefined();
        expect(row(el, 'palette.contentBg').textContent).not.toContain(
            'Changed by you'
        );
    });

    it('a saved gradient wins over None: transparent header + gradient opens on Gradient and survives save', async () => {
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...getBuiltinTheme('nordic'),
                palette: {
                    ...getBuiltinTheme('nordic').palette,
                    headerBg: 'transparent',
                    headerBgGradient: G
                },
                authoring: { start: 'theme', from: 'nordic', pinned: [] }
            })
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'T' });
        const control = gradientRow(el, 'palette.headerBg');
        expect(control).not.toBeNull();
        expect(control.gradient).toEqual(G);
        expect(
            row(el, 'palette.headerBg').querySelector('.te-none')
        ).toBeNull();
        await confirm(el);
        const saved = savedRecipe();
        expect(saved.palette.headerBg).toBe('transparent');
        expect(saved.palette.headerBgGradient).toEqual(G);
    });

    it('see-through: None -> Add a gradient -> Solid -> Use calculated', async () => {
        const nordic = getBuiltinTheme('nordic');
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...nordic,
                palette: { ...nordic.palette, headerBg: 'transparent' },
                authoring: { start: 'theme', from: 'nordic', pinned: [] }
            })
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'S' });
        const header = () => row(el, 'palette.headerBg');
        expect(header().textContent).toContain('None (see-through)');
        expect(gradientRow(el, 'palette.headerBg')).toBeNull();
        header().querySelector('.te-add-gradient').click();
        await flush();
        const g = gradientRow(el, 'palette.headerBg').gradient;
        expect(g.start).toMatch(/^#[0-9a-f]{6}$/i);
        expect(g.start).not.toBe('transparent');
        // the saved solid stays see-through under the gradient
        expect(preview(el).palette.headerBg).toBe('transparent');
        await fill(el, 'palette.headerBg', '#222222', null);
        expect(preview(el).palette.headerBg).toBe('#222222');
        expect(preview(el).palette.headerBgGradient).toBeNull();
        header().querySelector('.te-pin .te-link').click();
        await flush();
        expect(header().textContent).toContain('None (see-through)');
        expect(header().textContent).not.toContain('Changed by you');
    });

    it('a panel gradient starts gently, so the engine keeps showing it', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await fill(el, 'palette.contentBg', '#ffffff', {
            type: 'linear',
            angle: 135,
            start: '#ffffff',
            end: '#064e3b'
        });
        const g = preview(el).palette.contentBgGradient;
        expect(g.end).not.toBe('#064e3b');
        expect(resolveTokens(preview(el), null)['--c-card-backing-image']).toBe(
            undefined
        );
        expect(
            row(el, 'palette.contentBg').querySelector('.te-backing-note')
        ).toBeNull();
    });

    it('a dark panel gradient hidden behind the backing says so', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await fill(el, 'palette.contentBg', '#ffffff', {
            type: 'linear',
            angle: 135,
            start: '#ffffff',
            end: '#000000'
        });
        expect(resolveTokens(preview(el), null)['--c-card-backing-image']).toBe(
            'none'
        );
        expect(
            row(el, 'palette.contentBg').querySelector('.te-backing-note')
                .textContent
        ).toContain('Your form shows a solid panel instead');
    });

    it('Make see-through turns a fill back to see-through', async () => {
        const el = await mount({ startFrom: 'nordic' });
        row(el, 'palette.pageBg').querySelector('.te-seethrough').click();
        await flush();
        expect(preview(el).palette.pageBg).toBe('transparent');
        expect(row(el, 'palette.pageBg').textContent).toContain(
            'None (see-through)'
        );
    });

    it('keyboard focus follows the fill buttons instead of getting lost', async () => {
        const el = await mount({ startFrom: 'nordic' });
        row(el, 'palette.pageBg').querySelector('.te-seethrough').click();
        await flush();
        expect(el.shadowRoot.activeElement).toBe(
            row(el, 'palette.pageBg').querySelector('.te-add-solid')
        );
        row(el, 'palette.pageBg').querySelector('.te-add-gradient').click();
        await flush();
        expect(el.shadowRoot.activeElement).toBe(
            gradientRow(el, 'palette.pageBg')
        );
        // Make see-through sits on the row's own top line
        expect(
            row(el, 'palette.pageBg').querySelector(
                '.te-crow-top .te-seethrough'
            )
        ).not.toBeNull();
    });

    it('a translucent fill says so, and warns that editing makes it solid', async () => {
        const nordic = getBuiltinTheme('nordic');
        getCustomTheme.mockResolvedValueOnce(
            JSON.stringify({
                ...nordic,
                palette: {
                    ...nordic.palette,
                    contentBg: 'rgba(255, 255, 255, 0.7)'
                },
                authoring: { start: 'theme', from: 'nordic', pinned: [] }
            })
        );
        const el = await mount({ themeId: 'a0AXX0000001', themeName: 'Tr' });
        const text = row(el, 'palette.contentBg').textContent;
        expect(text).toContain('Translucent');
        expect(text).toContain('Replace with solid makes it opaque');
        expect(
            row(el, 'palette.contentBg')
                .querySelector('.te-add-solid')
                .textContent.trim()
        ).toBe('Replace with solid');
    });

    // ----------------------------------------------------- shape & type

    it('the font picker edits the recipe and pins it', async () => {
        const el = await mount({ startFrom: 'editorialIvory' });
        const picker = q(el, 'c-final-font-picker');
        expect(picker.mode).toBe('theme');
        expect(picker.level).toEqual({ typography: 'editorial' });
        picker.dispatchEvent(
            new CustomEvent('fontchange', {
                detail: { patch: { fonts: { pairing: 'editorialSerif' } } }
            })
        );
        await flush();
        await setName(el, 'Brand Serif');
        await confirm(el);
        const saved = savedRecipe();
        expect(saved.fonts).toEqual({ pairing: 'editorialSerif' });
        expect('typography' in saved).toBe(false);
        expect(saved.authoring.pinned).toEqual(
            expect.arrayContaining(['fonts', 'typography', 'customFont'])
        );
    });

    it('a shape choice of None is saved as a real value and pinned', async () => {
        const el = await mount({ startFrom: 'nordic' });
        const mesh = q(el, 'select[data-key="mesh"]');
        mesh.value = '';
        mesh.dispatchEvent(new CustomEvent('change'));
        await flush();
        await setName(el, 'No mesh');
        await confirm(el);
        expect(savedRecipe().effects.mesh).toBeNull();
        expect(savedRecipe().authoring.pinned).toContain('effects.mesh');
    });

    // -------------------------------------------------------------- save

    it('Save without a name says so and saves nothing', async () => {
        const el = await mount({ startFrom: 'nordic' });
        await confirm(el);
        expect(saveCustomTheme).not.toHaveBeenCalled();
        expect(q(el, '.te-error').textContent).toContain(
            'Give the theme a name'
        );
    });

    it('a new brand theme is named "<Org> brand" until you type one', async () => {
        const el = await mount({ startMode: 'brand' });
        expect(q(el, '.te-name').value).toBe('Acme brand');
    });

    it('Your brand needs a main color before Save', async () => {
        const el = await mount({ startMode: 'brand' });
        await confirm(el);
        expect(saveCustomTheme).not.toHaveBeenCalled();
    });

    it('Save uploads the logo, saves the recipe and reports both', async () => {
        const el = await mount({ startMode: 'brand' });
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await brand(el, { color: '#e11d48' });
        await logo(el);
        await confirm(el);
        expect(uploadImage).toHaveBeenCalledWith(
            expect.objectContaining({
                fileName: 'logo.png',
                formId: 'a05XX0000001'
            })
        );
        expect(saved.mock.calls[0][0].detail).toEqual({
            id: 'a0AXX0000001',
            name: 'Acme brand',
            logo: { url: '/sfc/logo', versionId: '068XX01' }
        });
    });

    it('unticking "use as logo" saves without uploading', async () => {
        const el = await mount({ startMode: 'brand' });
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await brand(el, { color: '#e11d48' });
        await logo(el, false);
        await confirm(el);
        expect(uploadImage).not.toHaveBeenCalled();
        expect(saved.mock.calls[0][0].detail.logo).toBeUndefined();
    });

    it('a failed save shows the server message and emits nothing', async () => {
        saveCustomTheme.mockRejectedValueOnce({
            body: { message: 'Name taken' }
        });
        const el = await mount({ startFrom: 'nordic' });
        const saved = jest.fn();
        el.addEventListener('save', saved);
        await setName(el, 'Dup');
        await confirm(el);
        expect(saved).not.toHaveBeenCalled();
        expect(q(el, '.te-error').textContent).toContain(
            'The theme couldn’t be saved: Name taken'
        );
    });

    it('a retry after a failed save reuses the uploaded logo', async () => {
        saveCustomTheme.mockRejectedValueOnce({ body: { message: 'Busy' } });
        const el = await mount({ startMode: 'brand' });
        await brand(el, { color: '#e11d48' });
        await logo(el);
        await confirm(el);
        await confirm(el);
        expect(uploadImage).toHaveBeenCalledTimes(1);
        expect(saveCustomTheme).toHaveBeenCalledTimes(2);
    });

    it('Cancel after an upload that was never saved removes the file', async () => {
        saveCustomTheme.mockRejectedValueOnce({ body: { message: 'Busy' } });
        const el = await mount({ startMode: 'brand' });
        const cancel = jest.fn();
        el.addEventListener('cancel', cancel);
        await brand(el, { color: '#e11d48' });
        await logo(el);
        await confirm(el);
        shell(el).dispatchEvent(new CustomEvent('dismiss'));
        expect(deleteImage).toHaveBeenCalledWith({
            contentVersionId: '068XX01',
            formId: 'a05XX0000001'
        });
        expect(cancel).toHaveBeenCalled();
    });

    it('an upload failure explains that nothing was saved', async () => {
        uploadImage.mockRejectedValueOnce({
            body: { message: 'Disconnected or Canceled' }
        });
        const el = await mount({ startMode: 'brand' });
        await brand(el, { color: '#e11d48' });
        await logo(el);
        await confirm(el);
        expect(q(el, '.te-error').textContent).toContain(
            'Your logo couldn’t be uploaded'
        );
        expect(saveCustomTheme).not.toHaveBeenCalled();
    });

    it('busy while saving, and a second click saves nothing twice', async () => {
        let release;
        saveCustomTheme.mockImplementationOnce(
            () =>
                new Promise((r) => {
                    release = r;
                })
        );
        const el = await mount({ startFrom: 'nordic' });
        await setName(el, 'Slow');
        shell(el).dispatchEvent(new CustomEvent('confirm'));
        await flush();
        expect(shell(el).busy).toBe(true);
        shell(el).dispatchEvent(new CustomEvent('confirm'));
        await flush();
        expect(saveCustomTheme).toHaveBeenCalledTimes(1);
        release('a0AXX0000010');
        await flush();
        await flush();
        expect(shell(el).busy).toBe(false);
    });
});
