import { createElement } from 'lwc';
import FinalAfterSubmit from 'c/finalAfterSubmit';

function mount(config, extra = {}) {
    const el = createElement('c-final-after-submit', {
        is: FinalAfterSubmit
    });
    el.config = config;
    Object.assign(el, extra);
    document.body.appendChild(el);
    return el;
}

describe('c-final-after-submit', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('empty config → screen mode with default message and Continue button', () => {
        const el = mount({});
        const rich = el.shadowRoot.querySelector(
            'lightning-formatted-rich-text'
        );
        expect(rich.value).toContain('Thank you!');
        expect(
            el.shadowRoot.querySelector('.continue').textContent.trim()
        ).toBe('Continue');
        expect(el.shadowRoot.querySelector('.pill')).toBeNull();
        expect(el.shadowRoot.querySelector('.toast')).toBeNull();
        expect(el.shadowRoot.querySelector('.confirmation-title')).toBeNull();
    });

    it('renders an optional title as text without changing the message or toast mode', () => {
        const el = mount({
            title: '<b>All done</b>',
            message: '<p>Saved.</p>'
        });
        const heading = el.shadowRoot.querySelector('.confirmation-title');
        expect(heading.textContent).toBe('<b>All done</b>');
        expect(heading.querySelector('b')).toBeNull();
        expect(el.shadowRoot.querySelector('.message').value).toBe(
            '<p>Saved.</p>'
        );
        const toast = mount({ mode: 'toast', title: 'Hidden title' });
        expect(
            toast.shadowRoot.querySelector('.confirmation-title')
        ).toBeNull();
    });

    it('auto-redirect renders the countdown pill with destination + delay', () => {
        const el = mount({
            autoRedirect: true,
            redirectTo: 'url',
            redirectDelay: 8
        });
        expect(el.shadowRoot.querySelector('.pill').textContent).toBe(
            'Redirecting to the custom URL in 8 seconds…'
        );
    });

    it('actionButton false hides the button; custom label + goesTo carry the intent', () => {
        const off = mount({ actionButton: false });
        expect(off.shadowRoot.querySelector('.continue')).toBeNull();

        const el = mount({
            buttonLabel: 'View record',
            buttonGoesTo: 'url',
            buttonUrl: 'https://x.dev'
        });
        const btn = el.shadowRoot.querySelector('.continue');
        expect(btn.textContent.trim()).toBe('View record');
        const handler = jest.fn();
        el.addEventListener('continue', handler);
        btn.click();
        expect(handler.mock.calls[0][0].detail).toEqual({
            goesTo: 'url',
            url: 'https://x.dev'
        });
    });

    it('toast mode: success bar, no screen; redirect line only when auto-redirect is ON', () => {
        const on = mount({
            mode: 'toast',
            autoRedirect: true,
            redirectTo: 'record'
        });
        expect(on.shadowRoot.querySelector('.toast').textContent).toContain(
            'Success!'
        );
        expect(
            on.shadowRoot.querySelector('.redirect-line').textContent
        ).toContain('Redirecting respondent to the new / updated record');
        expect(on.shadowRoot.querySelector('.screen')).toBeNull();

        // pre-fix: the line rendered even with auto-redirect disabled —
        // promising a redirect that never happens
        const off = mount({ mode: 'toast', redirectTo: 'record' });
        expect(off.shadowRoot.querySelector('.toast')).not.toBeNull();
        expect(off.shadowRoot.querySelector('.redirect-line')).toBeNull();
    });

    it('bleed paints its own card surface (the panel is gone there)', () => {
        const el = mount({}, { bleed: true });
        expect(el.shadowRoot.querySelector('.wrap--card')).not.toBeNull();
    });

    describe('download a copy (IMPL_PLAN_FORM_PDF §6.1)', () => {
        it('is hidden until the author turns it on AND the viewer has a copy', () => {
            expect(
                mount({}, { canDownload: true }).shadowRoot.querySelector(
                    '.download'
                )
            ).toBeNull();
            expect(
                mount({ downloadCopy: true }).shadowRoot.querySelector(
                    '.download'
                )
            ).toBeNull();
            const el = mount({ downloadCopy: true }, { canDownload: true });
            expect(
                el.shadowRoot.querySelector('.download').textContent.trim()
            ).toBe('Download a copy (PDF)');
        });

        it('uses the author label and fires downloadcopy', () => {
            const el = mount(
                { downloadCopy: true, downloadLabel: 'Save my answers' },
                { canDownload: true }
            );
            const handler = jest.fn();
            el.addEventListener('downloadcopy', handler);
            const btn = el.shadowRoot.querySelector('.download');
            expect(btn.textContent.trim()).toBe('Save my answers');
            btn.click();
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('says it is busy, waits, and shows a failure under the button', async () => {
            const el = mount(
                { downloadCopy: true },
                { canDownload: true, downloadBusy: true }
            );
            const handler = jest.fn();
            el.addEventListener('downloadcopy', handler);
            const btn = el.shadowRoot.querySelector('.download');
            expect(btn.textContent.trim()).toBe('Preparing your PDF…');
            expect(btn.disabled).toBe(true);
            expect(btn.getAttribute('aria-busy')).toBe('true');
            el.downloadBusy = false;
            el.downloadError = 'The PDF could not be made.';
            await Promise.resolve();
            expect(
                el.shadowRoot
                    .querySelector('.download-error')
                    .textContent.trim()
            ).toBe('The PDF could not be made.');
            el.shadowRoot.querySelector('.download').click();
            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('never shows in toast mode', () => {
            const el = mount(
                { mode: 'toast', downloadCopy: true },
                { canDownload: true }
            );
            expect(el.shadowRoot.querySelector('.download')).toBeNull();
        });
    });
});
