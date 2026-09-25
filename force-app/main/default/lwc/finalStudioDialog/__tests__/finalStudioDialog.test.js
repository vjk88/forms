import { createElement } from 'lwc';
import FinalStudioDialog from 'c/finalStudioDialog';

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(props = {}) {
    const el = createElement('c-final-studio-dialog', {
        is: FinalStudioDialog
    });
    Object.assign(el, { label: 'Mapping', ...props });
    document.body.appendChild(el);
    const got = [];
    el.addEventListener('confirm', () => got.push('confirm'));
    el.addEventListener('dismiss', () => got.push('dismiss'));
    return { el, got };
}

const root = (el) => el.shadowRoot.querySelector('section');
const button = (el, label) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')].find(
        (b) => b.label === label
    );
const escape = (el) =>
    root(el).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

describe('c-final-studio-dialog', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('is a labelled modal dialog, full or large', async () => {
        const { el } = mount({ size: 'full' });
        await flush();
        expect(root(el).getAttribute('role')).toBe('dialog');
        expect(root(el).getAttribute('aria-modal')).toBe('true');
        expect(root(el).className).toContain('sd--full');
        expect(el.shadowRoot.querySelector('.sd-title').textContent).toBe(
            'Mapping'
        );
        el.size = 'large';
        await flush();
        expect(root(el).className).toContain('sd--large');
    });

    it('the brand button confirms', async () => {
        const { el, got } = mount({ confirmLabel: 'Done' });
        await flush();
        button(el, 'Done').click();
        expect(got).toEqual(['confirm']);
    });

    it('leaves at once when nothing changed: Cancel, Escape and the close button', async () => {
        const { el, got } = mount();
        await flush();
        button(el, 'Cancel').click();
        escape(el);
        el.shadowRoot.querySelector('.sd-close').click();
        await flush();
        expect(got).toEqual(['dismiss', 'dismiss', 'dismiss']);
        expect(el.shadowRoot.querySelector('.sd-ask')).toBeNull();
    });

    it('asks first when something changed, inside the dialog', async () => {
        const { el, got } = mount({ dirty: true });
        await flush();
        escape(el);
        await flush();
        const ask = el.shadowRoot.querySelector('.sd-ask');
        expect(ask.getAttribute('role')).toBe('alertdialog');
        expect(ask.textContent).toContain('Discard your changes?');
        expect(got).toEqual([]);
    });

    it('Keep editing stays, and asking again still works', async () => {
        const { el, got } = mount({ dirty: true });
        await flush();
        button(el, 'Cancel').click();
        await flush();
        button(el, 'Keep editing').click();
        await flush();
        expect(el.shadowRoot.querySelector('.sd-ask')).toBeNull();
        expect(got).toEqual([]);
        // the bug the org found: the second time must ask again
        el.shadowRoot.querySelector('.sd-close').click();
        await flush();
        expect(el.shadowRoot.querySelector('.sd-ask')).toBeTruthy();
        button(el, 'Discard').click();
        await flush();
        expect(got).toEqual(['dismiss']);
    });

    it('Escape while asking means Keep editing', async () => {
        const { el, got } = mount({ dirty: true });
        await flush();
        escape(el);
        await flush();
        escape(el);
        await flush();
        expect(el.shadowRoot.querySelector('.sd-ask')).toBeNull();
        expect(got).toEqual([]);
    });

    it('the brand button does nothing while asking', async () => {
        const { el, got } = mount({ dirty: true, confirmLabel: 'Done' });
        await flush();
        escape(el);
        await flush();
        button(el, 'Done').click();
        expect(got).toEqual([]);
    });

    it('wraps Tab around at both edges', async () => {
        const { el } = mount();
        await flush();
        const [start, end] = el.shadowRoot.querySelectorAll('.sd-edge');
        const confirm = el.shadowRoot.querySelector('.sd-confirm');
        const close = el.shadowRoot.querySelector('.sd-close');
        confirm.focus = jest.fn();
        close.focus = jest.fn();
        start.dispatchEvent(new CustomEvent('focus'));
        end.dispatchEvent(new CustomEvent('focus'));
        expect(confirm.focus).toHaveBeenCalled();
        expect(close.focus).toHaveBeenCalled();
    });

    it('hears Escape even when focus has left the dialog', async () => {
        const { got } = mount();
        await flush();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flush();
        expect(got).toEqual(['dismiss']);
    });

    it('stops listening once removed', async () => {
        const { el, got } = mount();
        await flush();
        document.body.removeChild(el);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flush();
        expect(got).toEqual([]);
    });
});
