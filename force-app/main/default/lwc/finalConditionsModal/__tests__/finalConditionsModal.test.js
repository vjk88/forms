import { createElement } from 'lwc';
import FinalConditionsModal from 'c/finalConditionsModal';

/**
 * The dialog edits a draft: nothing leaves it until Apply conditions, and
 * Apply with problems keeps it open, shows them, and counts what's left.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

const SOURCES = [{ id: 'el_1', label: 'First name' }];

function mount(value, extra = {}) {
    const el = createElement('c-final-conditions-modal', {
        is: FinalConditionsModal
    });
    el.label = 'Visibility — Email';
    el.description = 'Show this field only when the conditions below are met.';
    el.sources = SOURCES;
    el.value = value;
    Object.assign(el, extra);
    document.body.appendChild(el);
    const closed = [];
    el.addEventListener('close', (e) => closed.push(e.detail));
    return { el, closed };
}

const editor = (el) => el.shadowRoot.querySelector('c-final-rule-editor');
const button = (el, label) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')].find(
        (b) => b.label === label
    );

const good = {
    action: 'show',
    logic: 'all',
    customLogic: null,
    rules: [{ source: 'el_1', operator: 'equals', value: 'Ann' }]
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('c-final-conditions-modal', () => {
    it('edits a copy — the caller’s value is never touched', async () => {
        const { el } = mount(good);
        await flush();
        expect(editor(el).value).toEqual(good);
        expect(editor(el).value).not.toBe(good);
    });

    it('Apply conditions returns the draft as edited', async () => {
        const { el, closed } = mount(good);
        await flush();
        const edited = {
            ...good,
            rules: [{ source: 'el_1', operator: 'isBlank', value: null }]
        };
        editor(el).dispatchEvent(
            new CustomEvent('rulechange', { detail: { value: edited } })
        );
        await flush();
        button(el, 'Apply conditions').click();
        expect(closed).toEqual([{ value: edited }]);
    });

    it('Cancel returns nothing', async () => {
        const { el, closed } = mount(good);
        await flush();
        button(el, 'Cancel').click();
        // close(undefined); an event with no detail reports null
        expect(closed).toEqual([null]);
    });

    it('Clear all empties only the draft and stays open', async () => {
        const { el, closed } = mount(good);
        await flush();
        button(el, 'Clear all').click();
        await flush();
        expect(editor(el).value).toBeNull();
        expect(closed).toEqual([]);
        button(el, 'Apply conditions').click();
        expect(closed).toEqual([{ value: null }]);
    });

    it('Apply with problems stays open, shows them and counts what is left', async () => {
        const { el, closed } = mount({
            ...good,
            rules: [
                { source: '', operator: 'equals', value: 'x' },
                { source: 'el_1', operator: 'equals', value: '' }
            ]
        });
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(closed).toEqual([]);
        expect(
            el.shadowRoot.querySelector('.cm-attention').textContent
        ).toContain('2 conditions need attention');
        expect(
            el.shadowRoot.querySelectorAll('c-final-rule-editor')
        ).toHaveLength(1);

        // fix everything: the line goes away and Apply closes
        const fixed = {
            ...good,
            rules: [
                { source: 'el_1', operator: 'isBlank', value: null },
                { source: 'el_1', operator: 'equals', value: 'x' }
            ]
        };
        editor(el).dispatchEvent(
            new CustomEvent('rulechange', { detail: { value: fixed } })
        );
        await flush();
        await flush();
        expect(el.shadowRoot.querySelector('.cm-attention')).toBeNull();
        button(el, 'Apply conditions').click();
        expect(closed).toEqual([{ value: fixed }]);
    });

    it('counts conditions, not problems, and names the logic', async () => {
        const { el } = mount({
            ...good,
            logic: 'custom',
            customLogic: '1 AND 2',
            rules: [{ source: '', operator: 'equals', value: 'x' }]
        });
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(
            el.shadowRoot.querySelector('.cm-attention').textContent
        ).toContain('1 condition and the custom logic need attention');
    });

    it('says "1 condition" in the singular', async () => {
        const { el } = mount({
            ...good,
            rules: [{ source: 'el_1', operator: 'equals', value: '' }]
        });
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(
            el.shadowRoot.querySelector('.cm-attention').textContent
        ).toContain('1 condition needs attention');
    });

    it('opened from Add conditions, starts with one row and drops it if unused', async () => {
        const { el, closed } = mount(null, { startWithRow: true });
        await flush();
        expect(editor(el).value.rules).toEqual([
            { source: '', operator: 'equals', value: '' }
        ]);
        button(el, 'Apply conditions').click();
        await flush();
        expect(closed).toEqual([{ value: null }]);
    });

    it('drops only the rows nobody used', async () => {
        const { el, closed } = mount({
            ...good,
            rules: [
                ...good.rules,
                { source: '', operator: 'equals', value: '' }
            ]
        });
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(closed).toEqual([{ value: good }]);
    });

    it('Clear all is off when there is nothing to clear, and starts over', async () => {
        const { el } = mount(null);
        await flush();
        expect(button(el, 'Clear all').disabled).toBe(true);

        const second = mount(good).el;
        await flush();
        expect(button(second, 'Clear all').disabled).toBe(false);
        const reset = jest.spyOn(editor(second), 'reset');
        button(second, 'Clear all').click();
        await flush();
        expect(reset).toHaveBeenCalled();
        expect(button(second, 'Clear all').disabled).toBe(true);
    });

    it('keeps its live region on screen so the count is announced', async () => {
        const { el } = mount(good);
        await flush();
        const region = el.shadowRoot.querySelector('.cm-attention-region');
        expect(region.getAttribute('role')).toBe('status');
        expect(region.textContent.trim()).toBe('');
    });
});
