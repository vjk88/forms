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

    it('minimal: compact lockup — no surface style, no brand row', async () => {
        const el = mount({
            style: 'minimal',
            title: 'T',
            brandName: 'ACME',
            bgImage: { url: '/sfc/banner' }
        });
        await flush();
        const hdr = el.shadowRoot.querySelector('.hdr');
        expect(hdr.className).toContain('style-minimal');
        expect(hdr.getAttribute('style')).toBeFalsy();
        expect(el.shadowRoot.querySelector('.brand-wordmark')).toBeNull();
    });

    it('standard keeps the brand row', async () => {
        const el = mount({ style: 'standard', title: 'T', brandName: 'ACME' });
        await flush();
        expect(el.shadowRoot.querySelector('.brand-wordmark').textContent).toBe(
            'ACME'
        );
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
