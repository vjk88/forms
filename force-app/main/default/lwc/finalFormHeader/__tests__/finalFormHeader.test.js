import { createElement } from 'lwc';
import FinalFormHeader from 'c/finalFormHeader';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(header) {
    const el = createElement('c-final-form-header', { is: FinalFormHeader });
    el.header = header;
    document.body.appendChild(el);
    return el;
}

describe('c-final-form-header', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('banner paints on its own layer at full opacity; the header box keeps only the fill', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            bgImage: { url: '/sfc/banner' }
        });
        await flush();
        const hdr = el.shadowRoot.querySelector('.hdr');
        // the fill (--c-header-bg + gradient) stays on the box via CSS — no inline override
        expect(hdr.getAttribute('style')).toBeNull();
        const layer = hdr.querySelector('.banner-layer');
        expect(layer).not.toBeNull();
        expect(layer.getAttribute('aria-hidden')).toBe('true');
        const style = layer.getAttribute('style');
        expect(style).toContain('url("/sfc/banner")');
        expect(style).toContain('opacity: 1');
        // no fake veil: the old recipe tinted with --c-header-bg, which is
        // transparent on 18 themes and a gradient (invalid in color-mix) on 10
        expect(style).not.toContain('color-mix');
    });

    it('image opacity 30 → the banner layer itself is 0.3 opaque (fill shows through)', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            bgImage: { url: '/sfc/banner', opacity: 30 }
        });
        await flush();
        const layer = el.shadowRoot.querySelector('.hdr .banner-layer');
        expect(layer.getAttribute('style')).toContain('opacity: 0.3');
    });

    it.each([
        [-20, 'opacity: 0;'],
        [250, 'opacity: 1;'],
        ['abc', 'opacity: 1;'],
        [null, 'opacity: 1;'],
        ['', 'opacity: 1;'],
        ['40', 'opacity: 0.4;']
    ])(
        'opacity %p is clamped to 0-100 (junk or blank → 100)',
        async (raw, want) => {
            const el = mount({
                title: 'T',
                bgImage: { url: '/b', opacity: raw }
            });
            await flush();
            expect(
                el.shadowRoot
                    .querySelector('.banner-layer')
                    .getAttribute('style')
            ).toContain(want);
        }
    );

    it('no banner → no banner layer', async () => {
        const el = mount({ style: 'standard', title: 'T' });
        await flush();
        expect(el.shadowRoot.querySelector('.banner-layer')).toBeNull();
    });

    it("legacy 'minimal' renders as standard (option deleted 2026-07-18 — it silently ate the Fill)", async () => {
        const el = mount({
            style: 'minimal',
            title: 'T',
            brandName: 'ACME',
            bgImage: { url: '/sfc/banner' }
        });
        await flush();
        const hdr = el.shadowRoot.querySelector('.hdr');
        expect(hdr.className).toContain('style-standard');
        expect(hdr.className).not.toContain('style-minimal');
        // the banner layer paints, the brand row shows
        expect(
            hdr.querySelector('.banner-layer').getAttribute('style')
        ).toContain('url("/sfc/banner")');
        expect(el.shadowRoot.querySelector('.brand-wordmark')).not.toBeNull();
    });

    it('standard keeps the brand row; wordmark is rich text with plain alt fallback', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            brandName: '<p><em>ACME</em></p>'
        });
        await flush();
        const mark = el.shadowRoot.querySelector(
            '.brand-wordmark lightning-formatted-rich-text'
        );
        expect(mark).not.toBeNull();
        expect(mark.value).toBe('<p><em>ACME</em></p>');
    });

    it('rich brand name + logo → alt text is the TAG-STRIPPED name', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            brandName: '<p><em>ACME</em></p>',
            logo: { url: '/sfc/logo' }
        });
        await flush();
        expect(
            el.shadowRoot.querySelector('.brand-logo').getAttribute('alt')
        ).toBe('ACME');
    });

    it('title + description render through formatted-rich-text (richtext fields)', async () => {
        const el = mount({
            style: 'standard',
            title: '<p><strong>Bold</strong> title</p>',
            description: 'plain subtitle'
        });
        await flush();
        const title = el.shadowRoot.querySelector(
            '.hdr-title lightning-formatted-rich-text'
        );
        expect(title).not.toBeNull();
        expect(title.value).toBe('<p><strong>Bold</strong> title</p>');
        // plain strings flow through unchanged (existing forms untouched)
        expect(
            el.shadowRoot.querySelector(
                '.hdr-desc lightning-formatted-rich-text'
            ).value
        ).toBe('plain subtitle');
    });
});

describe('c-final-form-header flush mode (One at a time open page)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('adds the flush class only when asked', async () => {
        const normal = mount({ style: 'standard', title: 'T' });
        await flush();
        expect(
            normal.shadowRoot
                .querySelector('.hdr')
                .classList.contains('hdr--flush')
        ).toBe(false);

        const el = createElement('c-final-form-header', {
            is: FinalFormHeader
        });
        el.header = { style: 'standard', title: 'T' };
        el.flush = true;
        document.body.appendChild(el);
        await flush();
        expect(
            el.shadowRoot.querySelector('.hdr').classList.contains('hdr--flush')
        ).toBe(true);
    });
});
