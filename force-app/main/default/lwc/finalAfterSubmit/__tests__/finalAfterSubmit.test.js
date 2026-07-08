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

    it('toast mode: success bar + redirect line, no screen', () => {
        const el = mount({ mode: 'toast', redirectTo: 'record' });
        expect(el.shadowRoot.querySelector('.toast').textContent).toContain(
            'Success!'
        );
        expect(
            el.shadowRoot.querySelector('.redirect-line').textContent
        ).toContain('Redirecting respondent to the new / updated record');
        expect(el.shadowRoot.querySelector('.screen')).toBeNull();
    });

    it('bleed paints its own card surface (the panel is gone there)', () => {
        const el = mount({}, { bleed: true });
        expect(el.shadowRoot.querySelector('.wrap--card')).not.toBeNull();
    });
});
