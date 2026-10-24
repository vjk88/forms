import { createElement } from 'lwc';
import FinalFontPicker from 'c/finalFontPicker';
import { resolveFontRefs } from 'c/finalThemeEngine';

jest.mock(
    '@salesforce/resourceUrl/formFonts',
    () => ({ default: '/resource/1/formFonts' }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

const BRAND_X = {
    key: 'Brand_X',
    family: 'Brand X',
    fallback: 'serif',
    resource: 'brand_x'
};

function mount(props) {
    const el = createElement('c-final-font-picker', { is: FinalFontPicker });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

const q = (el, sel) => el.shadowRoot.querySelector(sel);

describe('c-final-font-picker', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        document.head
            .querySelectorAll('style[id^="final-font"]')
            .forEach((s) => s.remove());
    });

    it('form mode: From theme is chosen, groups render, a pick emits a patch', async () => {
        const el = mount({
            mode: 'form',
            level: {},
            effective: resolveFontRefs(null, {}),
            uploadedFonts: [BRAND_X],
            inheritLabel: 'Device default'
        });
        const handler = jest.fn();
        el.addEventListener('fontchange', handler);
        await flush();
        const select = q(el, 'select[data-role="pairing"]');
        expect(select.value).toBe('inherit');
        expect(
            [...select.querySelectorAll('optgroup')].map((g) => g.label)
        ).toEqual(['Theme', 'Pairings', 'Your uploaded fonts']);

        select.value = 'pairing:poster';
        select.dispatchEvent(new CustomEvent('change'));
        expect(handler.mock.calls[0][0].detail.patch).toEqual({
            fonts: { pairing: 'poster' }
        });
    });

    it('theme mode offers no From theme entry', async () => {
        const el = mount({
            mode: 'theme',
            level: { typography: 'editorial' },
            effective: resolveFontRefs({ typography: 'editorial' }, null)
        });
        await flush();
        const select = q(el, 'select[data-role="pairing"]');
        expect(select.querySelector('option[value="inherit"]')).toBeNull();
        expect(select.value).toBe('legacy:editorial');
    });

    it('the sample is drawn in the real fonts, and those fonts get registered', async () => {
        const level = { fonts: { pairing: 'poster' } };
        const el = mount({
            mode: 'form',
            level,
            effective: resolveFontRefs(null, level)
        });
        await flush();
        const heading = q(el, '.fp-sample-heading');
        const body = q(el, '.fp-sample-body');
        expect(heading.getAttribute('style')).toContain(
            'FormsBundledBebasNeue'
        );
        // Bebas Neue has no bold: the sample uses its real weight
        expect(heading.getAttribute('style')).toContain('font-weight: 400');
        expect(body.getAttribute('style')).toContain('FormsBundledInter');
        expect(
            document.getElementById('final-fontb-bundled-bebasneue')
        ).not.toBeNull();
        expect(
            document.getElementById('final-fontb-bundled-inter')
        ).not.toBeNull();
    });

    it('Customize shows Heading and Body; Body leaves out display-only faces', async () => {
        const el = mount({
            mode: 'form',
            level: {},
            effective: resolveFontRefs(null, {})
        });
        await flush();
        expect(q(el, 'select[data-side="display"]')).toBeNull();
        const link = q(el, '.fp-link');
        expect(link.getAttribute('aria-expanded')).toBe('false');
        link.click();
        await flush();
        expect(link.getAttribute('aria-expanded')).toBe('true');
        const display = q(el, 'select[data-side="display"]');
        const body = q(el, 'select[data-side="body"]');
        const values = (s) =>
            [...s.querySelectorAll('option')].map((o) => o.value);
        expect(values(display)).toContain('bundled:bebasNeue');
        expect(values(body)).not.toContain('bundled:bebasNeue');
        expect(values(body)).toContain('bundled:lora');
    });

    it('a heading pick on a form with its own font keeps the body (one-side rule)', async () => {
        const level = { customFont: BRAND_X };
        const el = mount({
            mode: 'form',
            level,
            effective: resolveFontRefs(null, level),
            uploadedFonts: [BRAND_X]
        });
        const handler = jest.fn();
        el.addEventListener('fontchange', handler);
        await flush();
        q(el, '.fp-link').click();
        await flush();
        const display = q(el, 'select[data-side="display"]');
        display.value = 'bundled:oswald';
        display.dispatchEvent(new CustomEvent('change'));
        const { fonts } = handler.mock.calls[0][0].detail.patch;
        expect(fonts.display).toEqual({ source: 'bundled', key: 'oswald' });
        expect(fonts.body).toMatchObject({
            source: 'uploaded',
            family: 'Brand X',
            resource: 'brand_x'
        });
    });

    it('a custom split opens Customize by itself and reads "Custom"', async () => {
        const level = {
            fonts: { display: { source: 'bundled', key: 'oswald' } }
        };
        const el = mount({
            mode: 'form',
            level,
            effective: resolveFontRefs(null, level)
        });
        await flush();
        expect(q(el, 'select[data-role="pairing"]').value).toBe('custom');
        expect(q(el, 'select[data-side="display"]').value).toBe(
            'bundled:oswald'
        );
    });

    it('disabled: nothing is emitted', async () => {
        const el = mount({
            mode: 'form',
            level: {},
            effective: resolveFontRefs(null, {}),
            disabled: true
        });
        const handler = jest.fn();
        el.addEventListener('fontchange', handler);
        await flush();
        const select = q(el, 'select[data-role="pairing"]');
        select.value = 'pairing:modern';
        select.dispatchEvent(new CustomEvent('change'));
        expect(handler).not.toHaveBeenCalled();
    });

    it('focus() lands on the pairing select', async () => {
        const el = mount({
            mode: 'form',
            level: {},
            effective: resolveFontRefs(null, {})
        });
        await flush();
        el.focus();
        expect(el.shadowRoot.activeElement).toBe(
            q(el, 'select[data-role="pairing"]')
        );
    });
});
