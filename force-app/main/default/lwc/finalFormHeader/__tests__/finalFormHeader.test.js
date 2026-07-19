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

    it('standard: fill under the banner; full-opacity image gets a 0% veil', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            bgImage: { url: '/sfc/banner' }
        });
        await flush();
        const hdr = el.shadowRoot.querySelector('.hdr');
        const style = hdr.getAttribute('style');
        expect(style).toContain('url("/sfc/banner")');
        expect(style).toContain(
            'color-mix(in srgb, var(--c-header-bg) 0%, transparent)'
        );
    });

    it('image opacity 30 → a 70% fill-tinted veil OVER the image (fade into the fill)', async () => {
        const el = mount({
            style: 'standard',
            title: 'T',
            bgImage: { url: '/sfc/banner', opacity: 30 }
        });
        await flush();
        expect(
            el.shadowRoot.querySelector('.hdr').getAttribute('style')
        ).toContain('var(--c-header-bg) 70%, transparent');
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
        // the surface paints (banner + veil), the brand row shows
        expect(hdr.getAttribute('style')).toContain('url("/sfc/banner")');
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
