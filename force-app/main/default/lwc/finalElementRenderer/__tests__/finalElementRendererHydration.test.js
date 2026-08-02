import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

/** Native-control hydration (ext audit 2026-08-02, org-repro'd): the viewer
 *  round-trips answers as el.value, but no native lightning control was
 *  bound to it — Back in any paginated layout remounted inputs BLANK while
 *  the store still held (and would submit) the typed answer. */

const mount = (element) => {
    const el = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    el.element = element;
    document.body.appendChild(el);
    return el;
};

const OPTS = [
    { label: 'Alpha', value: 'a' },
    { label: 'Beta', value: 'b' }
];

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('native control value hydration', () => {
    it('text input displays the hydrated answer', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Name',
            value: 'hello world',
            config: { inputType: 'text' }
        });
        expect(el.shadowRoot.querySelector('lightning-input').value).toBe(
            'hello world'
        );
    });

    it('checkbox hydrates checked, not value', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Agree?',
            value: true,
            config: { inputType: 'checkbox' }
        });
        const input = el.shadowRoot.querySelector('lightning-input');
        expect(input.checked).toBe(true);
        expect(input.value).toBeUndefined();
    });

    it('textarea displays the hydrated answer', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Notes',
            value: 'multi line',
            config: { inputType: 'textarea' }
        });
        expect(el.shadowRoot.querySelector('lightning-textarea').value).toBe(
            'multi line'
        );
    });

    it('dropdown and radio group hydrate their selection', () => {
        const dd = mount({
            id: 'e1',
            type: 'field',
            label: 'Pick',
            value: 'b',
            config: { renderAs: 'Dropdown', options: OPTS }
        });
        expect(dd.shadowRoot.querySelector('lightning-combobox').value).toBe(
            'b'
        );

        const rg = mount({
            id: 'e2',
            type: 'field',
            label: 'Pick',
            value: 'a',
            config: { renderAs: 'Radio_Buttons', options: OPTS }
        });
        expect(rg.shadowRoot.querySelector('lightning-radio-group').value).toBe(
            'a'
        );
    });

    it('toggle hydrates checked from the boolean answer', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'On?',
            value: true,
            config: { renderAs: 'Toggle', inputType: 'checkbox' }
        });
        expect(el.shadowRoot.querySelector('lightning-input').checked).toBe(
            true
        );
    });

    it('unanswered controls stay unset — no phantom values', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'Name',
            config: { inputType: 'text' }
        });
        expect(
            el.shadowRoot.querySelector('lightning-input').value
        ).toBeUndefined();
    });
});

describe('label click forwarding', () => {
    it('toggle label click flips the switch and dispatches the boolean', () => {
        const el = mount({
            id: 'e1',
            type: 'field',
            label: 'On?',
            value: true,
            config: { renderAs: 'Toggle', inputType: 'checkbox' }
        });
        const handler = jest.fn();
        el.addEventListener('valuechange', handler);
        el.shadowRoot.querySelector('.field-label').click();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.value).toBe(false);
    });
});
