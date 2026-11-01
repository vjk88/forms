import { createElement } from 'lwc';
import FinalStudioRail from 'c/finalStudioRail';

const TABS = [
    { key: 'fields', label: 'Fields', icon: 'utility:list' },
    { key: 'blocks', label: 'Blocks', icon: 'utility:apps', dot: true },
    { key: 'colors', label: 'Colors', icon: 'utility:brush', divider: true }
];

function mount(props = {}) {
    const el = createElement('c-final-studio-rail', { is: FinalStudioRail });
    Object.assign(el, { tabs: TABS, value: 'fields', label: 'Tools' }, props);
    document.body.appendChild(el);
    return el;
}

const buttons = (el) => [...el.shadowRoot.querySelectorAll('.rail-tab')];

describe('c-final-studio-rail', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders one labelled button per tab, the selected one pressed', () => {
        const el = mount();
        expect(
            el.shadowRoot.querySelector('nav').getAttribute('aria-label')
        ).toBe('Tools');
        expect(buttons(el).map((b) => b.dataset.tab)).toEqual([
            'fields',
            'blocks',
            'colors'
        ]);
        expect(buttons(el).map((b) => b.getAttribute('aria-pressed'))).toEqual([
            'true',
            'false',
            'false'
        ]);
        expect(buttons(el)[0].classList).toContain('on');
        expect(el.shadowRoot.querySelector('.rail-label').textContent).toBe(
            'Fields'
        );
    });

    it('marks customized tabs with a dot the screen reader hears', () => {
        const el = mount();
        const [fields, blocks] = buttons(el);
        expect(fields.querySelector('.rail-dot')).toBeNull();
        expect(blocks.querySelector('.rail-dot')).not.toBeNull();
        expect(blocks.querySelector('.slds-assistive-text').textContent).toBe(
            ', customized'
        );
    });

    it('draws a divider only above tabs that ask for one', () => {
        const el = mount();
        const items = [...el.shadowRoot.querySelectorAll('.rail-item')];
        expect(
            items.map((i) => Boolean(i.querySelector('.rail-divider')))
        ).toEqual([false, false, true]);
    });

    it('emits select with the clicked key and leaves the selection to the host', async () => {
        const el = mount();
        const handler = jest.fn();
        el.addEventListener('select', handler);
        buttons(el)[2].click();
        expect(handler.mock.calls[0][0].detail).toEqual({ key: 'colors' });
        await Promise.resolve();
        expect(buttons(el)[0].getAttribute('aria-pressed')).toBe('true');
        el.value = 'colors';
        await Promise.resolve();
        expect(buttons(el)[2].getAttribute('aria-pressed')).toBe('true');
    });
});
