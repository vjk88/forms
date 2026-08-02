import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** advancekey contract: past this component's shadow boundary LWS retargets
 *  keydown origins to the HOST, so nav layouts can't tell an input Enter
 *  from a chip Enter. The renderer decides in-scope and re-emits the
 *  semantic `advancekey` / `advancefocus` events (org QA 2026-08-01). */

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const key = (target, init = {}) =>
    target.dispatchEvent(
        new KeyboardEvent('keydown', {
            key: 'Enter',
            bubbles: true,
            composed: true,
            ...init
        })
    );

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('advancekey re-emission', () => {
    it('Enter in a single-line lightning-input re-emits advancekey', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Name',
            render: { inputType: 'text' }
        });
        const handler = jest.fn();
        el.addEventListener('advancekey', handler);
        key(el.shadowRoot.querySelector('lightning-input'));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('Enter on a scale chip stays quiet — buttons keep their native activation', () => {
        const el = mount({ id: 'e1', type: 'scale', label: 'Rate' });
        const handler = jest.fn();
        el.addEventListener('advancekey', handler);
        key(el.shadowRoot.querySelector('button[role="radio"]'));
        expect(handler).not.toHaveBeenCalled();
    });

    it('multiline host: plain Enter quiet, Ctrl+Enter re-emits', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Notes',
            config: { inputType: 'textarea' }
        });
        const area = el.shadowRoot.querySelector('lightning-textarea');
        const handler = jest.fn();
        el.addEventListener('advancekey', handler);
        key(area);
        expect(handler).not.toHaveBeenCalled();
        key(area, { ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('focusin re-emits advancefocus with the multiline verdict', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Notes',
            config: { inputType: 'textarea' }
        });
        const handler = jest.fn();
        el.addEventListener('advancefocus', handler);
        el.shadowRoot
            .querySelector('lightning-textarea')
            .dispatchEvent(
                new FocusEvent('focusin', { bubbles: true, composed: true })
            );
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.multiline).toBe(true);
    });
});
