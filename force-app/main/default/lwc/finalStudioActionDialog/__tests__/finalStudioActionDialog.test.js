import { createElement } from 'lwc';
import FinalStudioActionDialog from 'c/finalStudioActionDialog';

const flush = () => Promise.resolve();

function mount(props = {}) {
    const element = createElement('c-final-studio-action-dialog', {
        is: FinalStudioActionDialog
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-final-studio-action-dialog', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('opens as a labelled modal with a useful default clone name', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        await flush();

        const dialog = element.shadowRoot.querySelector('[role="dialog"]');
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toMatch(
            /^clone-title(?:-\d+)?$/
        );
        expect(input.value).toBe('Event feedback — Copy');
        expect(
            element.shadowRoot.querySelector('.action-backdrop').tabIndex
        ).toBe(-1);
    });

    it('keeps the generated default within the Salesforce name limit', () => {
        const element = mount({ sourceName: 'A'.repeat(80) });
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        expect(input.value).toHaveLength(80);
        expect(input.value.endsWith(' — Copy')).toBe(true);
        expect(
            element.shadowRoot.querySelector('[data-id="clone-confirm"]')
                .disabled
        ).toBe(false);
    });

    it('keeps Close and Confirm in the focus cycle', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const close = element.shadowRoot.querySelector(
            '[data-id="clone-close"]'
        );
        const confirm = element.shadowRoot.querySelector(
            '[data-id="clone-confirm"]'
        );
        close.focus = jest.fn();
        confirm.focus = jest.fn();
        const sentinels =
            element.shadowRoot.querySelectorAll('.focus-sentinel');

        sentinels[0].dispatchEvent(new CustomEvent('focus'));
        sentinels[1].dispatchEvent(new CustomEvent('focus'));

        expect(confirm.focus).toHaveBeenCalledTimes(1);
        expect(close.focus).toHaveBeenCalledTimes(1);
    });

    it('moves focus to the name input when the dialog opens', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        await flush();
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.focus = jest.fn();

        element.sourceName = 'Updated feedback';
        await flush();
        await flush();

        expect(input.focus).toHaveBeenCalledTimes(1);
    });

    it('emits the trimmed clone name after local validation', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.value = '  Follow-up survey  ';
        input.dispatchEvent(new CustomEvent('change'));
        input.reportValidity = jest.fn(() => true);

        element.shadowRoot.querySelector('[data-id="clone-confirm"]').click();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            name: 'Follow-up survey'
        });
    });

    it('submits the single name field with Enter', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.reportValidity = jest.fn(() => true);

        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                composed: true
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.name).toBe(
            'Event feedback — Copy'
        );
    });

    it('cancels on Escape and keeps busy work protected', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('cancel', handler);

        element.shadowRoot.querySelector('.action-shell').dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);

        element.busy = true;
        await flush();
        element.shadowRoot.querySelector('.action-shell').dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);
        expect(
            element.shadowRoot.querySelector('[data-id="clone-confirm"]')
                .disabled
        ).toBe(true);
        expect(
            element.shadowRoot.querySelector('[data-id="clone-confirm"]').label
        ).toBe('Cloning…');
        expect(element.shadowRoot.querySelector('[role="status"]')).not.toBe(
            null
        );
    });

    it('announces server errors without closing the dialog', () => {
        const element = mount({
            sourceName: 'Event feedback',
            error: 'The source form is unavailable.'
        });
        const alert = element.shadowRoot.querySelector('[role="alert"]');
        expect(alert.textContent).toContain('source form is unavailable');
        expect(element.shadowRoot.querySelector('[role="dialog"]')).not.toBe(
            null
        );
    });
});
