import { createElement } from 'lwc';
import FinalButtonGroup from 'c/finalButtonGroup';

const OPTIONS = [
    { label: 'Small', value: 'sm' },
    { label: 'Medium', value: 'md', title: 'The usual size' },
    { label: 'Large', value: 'lg', disabled: true }
];

function mount(props = {}) {
    const el = createElement('c-final-button-group', { is: FinalButtonGroup });
    Object.assign(el, {
        label: 'Size',
        options: OPTIONS,
        value: 'md',
        ...props
    });
    document.body.appendChild(el);
    return el;
}

const buttons = (el) => [...el.shadowRoot.querySelectorAll('button')];

describe('c-final-button-group', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders one button per option inside a named group', () => {
        const el = mount();
        const group = el.shadowRoot.querySelector('[role="group"]');
        expect(group.getAttribute('aria-label')).toBe('Size');
        expect(buttons(el).map((b) => b.textContent.trim())).toEqual([
            'Small',
            'Medium',
            'Large'
        ]);
    });

    it('marks only the chosen option as pressed and filled', () => {
        const el = mount();
        const [sm, md] = buttons(el);
        expect(md.getAttribute('aria-pressed')).toBe('true');
        expect(md.classList.contains('on')).toBe(true);
        expect(sm.getAttribute('aria-pressed')).toBe('false');
        expect(sm.classList.contains('on')).toBe(false);
        expect(md.getAttribute('title')).toBe('The usual size');
    });

    it('fires change with the option value on every click, the chosen one included', () => {
        const el = mount();
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail.value));
        buttons(el)[0].click();
        buttons(el)[1].click();
        expect(seen).toEqual(['sm', 'md']);
    });

    it('keeps the value type of non-string options', () => {
        const el = mount({
            options: [
                { label: 'Off', value: false },
                { label: 'On', value: true }
            ],
            value: false
        });
        const seen = [];
        el.addEventListener('change', (e) => seen.push(e.detail.value));
        buttons(el)[1].click();
        expect(seen).toEqual([true]);
        expect(buttons(el)[0].getAttribute('aria-pressed')).toBe('true');
    });

    it('disables single options, or the whole group', async () => {
        const el = mount();
        expect(buttons(el)[2].disabled).toBe(true);
        expect(buttons(el)[0].disabled).toBe(false);
        el.disabled = true;
        await Promise.resolve();
        expect(buttons(el).every((b) => b.disabled)).toBe(true);
    });

    it('stretches to the row width when asked', async () => {
        const el = mount();
        expect(
            el.shadowRoot.querySelector('.bg').classList.contains('bg-stretch')
        ).toBe(false);
        el.stretch = true;
        await Promise.resolve();
        expect(
            el.shadowRoot.querySelector('.bg').classList.contains('bg-stretch')
        ).toBe(true);
    });
});
