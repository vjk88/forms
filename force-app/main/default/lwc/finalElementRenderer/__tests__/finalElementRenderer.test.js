import { createElement } from 'lwc';
import FinalElementRenderer from 'c/finalElementRenderer';

const FIELD = (over = {}) => ({
    id: 'e1',
    type: 'field',
    label: 'Last Name',
    required: false,
    help: null,
    labelPosition: 'top',
    config: { inputType: 'text' },
    ...over
});

async function mount(element) {
    const cmp = createElement('c-final-element-renderer', {
        is: FinalElementRenderer
    });
    cmp.element = element;
    document.body.appendChild(cmp);
    await Promise.resolve();
    return cmp;
}

describe('c-final-element-renderer', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    describe('help text accessibility (review F2)', () => {
        it('helptext renders OUTSIDE the aria-hidden label, as its sibling', async () => {
            const cmp = await mount(FIELD({ help: 'We need this' }));
            const help = cmp.shadowRoot.querySelector('lightning-helptext');
            expect(help).not.toBeNull();
            // never inside a hidden region — axe aria-hidden-focus
            expect(help.closest('[aria-hidden="true"]')).toBeNull();
            expect(help.parentElement.classList.contains('field-label-row')).toBe(true);
        });

        it('only the label itself is aria-hidden', async () => {
            const cmp = await mount(FIELD({ help: 'hint' }));
            const label = cmp.shadowRoot.querySelector('label.field-label');
            expect(label.getAttribute('aria-hidden')).toBe('true');
        });

        it('custom label shown → native field-level-help suppressed (no double help)', async () => {
            const cmp = await mount(FIELD({ help: 'hint' }));
            const input = cmp.shadowRoot.querySelector('lightning-input');
            expect(input.fieldLevelHelp).toBeUndefined();
        });

        it('labelPosition hidden → help rides the native field instead', async () => {
            const cmp = await mount(
                FIELD({ help: 'hint', labelPosition: 'hidden' })
            );
            expect(cmp.shadowRoot.querySelector('label.field-label')).toBeNull();
            const input = cmp.shadowRoot.querySelector('lightning-input');
            expect(input.fieldLevelHelp).toBe('hint');
        });
    });

    describe('labelPosition (review F3)', () => {
        it('top → stacked block (no row class)', async () => {
            const cmp = await mount(FIELD());
            const field = cmp.shadowRoot.querySelector('.field');
            expect(field.classList.contains('label-left')).toBe(false);
        });

        it('left → row layout class on the field', async () => {
            const cmp = await mount(FIELD({ labelPosition: 'left' }));
            const field = cmp.shadowRoot.querySelector('.field');
            expect(field.classList.contains('label-left')).toBe(true);
        });

        it('left + textarea → top-aligned variant', async () => {
            const cmp = await mount(
                FIELD({
                    labelPosition: 'left',
                    config: { inputType: 'textarea' }
                })
            );
            const field = cmp.shadowRoot.querySelector('.field');
            expect(field.classList.contains('label-left')).toBe(true);
            expect(field.classList.contains('field-textarea')).toBe(true);
        });
    });

    describe('labelStyle (review F15)', () => {
        it.each([
            ['uppercase', 'label-uppercase'],
            ['muted', 'label-muted']
        ])('%s maps to its class', async (style, cls) => {
            const cmp = await mount(FIELD({ labelStyle: style }));
            const label = cmp.shadowRoot.querySelector('label.field-label');
            expect(label.classList.contains(cls)).toBe(true);
        });

        it('default/unknown adds no style class', async () => {
            const cmp = await mount(FIELD({ labelStyle: 'default' }));
            const label = cmp.shadowRoot.querySelector('label.field-label');
            expect(label.className).toBe('field-label');
        });
    });

    describe('valuechange payload (review F7)', () => {
        it('text input emits event.target.value', async () => {
            const cmp = await mount(FIELD());
            const handler = jest.fn();
            cmp.addEventListener('valuechange', handler);
            const input = cmp.shadowRoot.querySelector('lightning-input');
            input.value = 'Ada';
            input.type = 'text';
            input.dispatchEvent(new CustomEvent('change'));
            expect(handler.mock.calls[0][0].detail).toEqual({
                elementId: 'e1',
                value: 'Ada'
            });
        });

        it('checkbox emits event.target.checked — not the constant value', async () => {
            const cmp = await mount(FIELD({ config: { inputType: 'checkbox' } }));
            const handler = jest.fn();
            cmp.addEventListener('valuechange', handler);
            const input = cmp.shadowRoot.querySelector('lightning-input');
            input.type = 'checkbox';
            input.checked = true;
            input.value = 'on'; // the garbage the old code forwarded
            input.dispatchEvent(new CustomEvent('change'));
            expect(handler.mock.calls[0][0].detail).toEqual({
                elementId: 'e1',
                value: true
            });
        });

        it('clicking the custom label toggles a checkbox and emits (cross-shadow click-through)', async () => {
            const cmp = await mount(FIELD({ config: { inputType: 'checkbox' } }));
            const handler = jest.fn();
            cmp.addEventListener('valuechange', handler);
            const input = cmp.shadowRoot.querySelector('lightning-input');
            input.checked = false;
            cmp.shadowRoot.querySelector('label.field-label').click();
            expect(input.checked).toBe(true);
            expect(handler.mock.calls[0][0].detail.value).toBe(true);
        });

        it('clicking the label of a text field only focuses — no event', async () => {
            const cmp = await mount(FIELD());
            const handler = jest.fn();
            cmp.addEventListener('valuechange', handler);
            cmp.shadowRoot.querySelector('label.field-label').click();
            expect(handler).not.toHaveBeenCalled();
        });
    });

    it('unsupported type renders the placeholder, never crashes', async () => {
        const cmp = await mount({ id: 'x', type: 'martian' });
        expect(cmp.shadowRoot.querySelector('.unsupported')).not.toBeNull();
    });
});
