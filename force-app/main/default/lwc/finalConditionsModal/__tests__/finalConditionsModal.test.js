import { createElement } from 'lwc';
import FinalConditionsModal from 'c/finalConditionsModal';
import LightningConfirm from 'lightning/confirm';

jest.mock('lightning/confirm', () => ({
    __esModule: true,
    default: { open: jest.fn() }
}));
jest.mock(
    '@salesforce/apex/FinalMappingController.checkConditions',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

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

describe('the Advanced (SOQL) tab (D50)', () => {
    const TYPED_CONTEXT = {
        spec: {},
        actionId: 'act_a',
        questions: [
            {
                elementKey: 'el_n',
                label: 'Surname',
                answerType: 'Text',
                mappable: true
            }
        ]
    };
    const openTyped = (value, typed) =>
        mount(value, {
            columns: 'mapping',
            allowTyped: true,
            typedValue: typed,
            typedContext: TYPED_CONTEXT
        });
    const tabset = (el) => el.shadowRoot.querySelector('lightning-tabset');
    const soqlBox = (el) => el.shadowRoot.querySelector('c-final-mapping-soql');
    const notice = (el) =>
        [...el.shadowRoot.querySelectorAll('.cm-replace')].map((n) =>
            n.textContent.trim()
        );
    async function goTo(el, value) {
        const tab = [...el.shadowRoot.querySelectorAll('lightning-tab')].find(
            (t) => t.value === value
        );
        tab.dispatchEvent(new CustomEvent('active'));
        await flush();
    }
    function typeSoql(el, text) {
        soqlBox(el).dispatchEvent(
            new CustomEvent('soqlchange', { detail: { value: text } })
        );
    }

    afterEach(() => jest.clearAllMocks());

    it('opens on the saved mode', async () => {
        const { el } = openTyped(null, { mode: 'soql', soql: 'Title = null' });
        await flush();
        expect(tabset(el).activeTabValue).toBe('soql');
        expect(soqlBox(el).value).toBe('Title = null');
    });

    it('keeps both drafts across tab switches and asks nothing', async () => {
        const { el } = openTyped(good, { mode: 'rows', soql: '' });
        await flush();
        await goTo(el, 'soql');
        typeSoql(el, 'Title = null');
        await goTo(el, 'conditions');
        await goTo(el, 'soql');
        expect(soqlBox(el).value).toBe('Title = null');
        expect(editor(el).value).toEqual(good);
        expect(LightningConfirm.open).not.toHaveBeenCalled();
    });

    it('warns of a replacement only when the other tab has content', async () => {
        const { el } = openTyped(null, { mode: 'rows', soql: '' });
        await flush();
        await goTo(el, 'soql');
        expect(notice(el)).toEqual([]);
        const second = openTyped(good, { mode: 'rows', soql: '' }).el;
        await flush();
        await goTo(second, 'soql');
        expect(notice(second)).toContain(
            'Applying uses Advanced (SOQL). The 1 condition you built will be removed.'
        );
    });

    it('Apply asks once before dropping built conditions; Cancel keeps both', async () => {
        LightningConfirm.open.mockResolvedValue(false);
        const { el, closed } = openTyped(good, { mode: 'rows', soql: '' });
        await flush();
        await goTo(el, 'soql');
        typeSoql(el, 'Title = null');
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(LightningConfirm.open).toHaveBeenCalledTimes(1);
        expect(closed).toEqual([]);
        expect(editor(el).value).toEqual(good);
    });

    it('Confirm applies the typed conditions and drops the built ones', async () => {
        LightningConfirm.open.mockResolvedValue(true);
        const { el, closed } = openTyped(good, { mode: 'rows', soql: '' });
        await flush();
        await goTo(el, 'soql');
        typeSoql(el, 'Title = null');
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(closed).toEqual([
            { value: null, typed: { mode: 'soql', soql: 'Title = null' } }
        ]);
    });

    it('built conditions over typed text ask the mirror question', async () => {
        LightningConfirm.open.mockResolvedValue(true);
        const { el, closed } = openTyped(good, {
            mode: 'soql',
            soql: 'Title = null'
        });
        await flush();
        await goTo(el, 'conditions');
        button(el, 'Apply conditions').click();
        await flush();
        expect(LightningConfirm.open.mock.calls[0][0].message).toBe(
            'Replace the Advanced (SOQL) conditions with the built conditions?'
        );
        expect(closed).toEqual([
            { value: good, typed: { mode: 'rows', soql: '' } }
        ]);
    });

    it('an empty typed tab says what to do instead of applying', async () => {
        const { el, closed } = openTyped(null, { mode: 'soql', soql: '' });
        await flush();
        button(el, 'Apply conditions').click();
        await flush();
        expect(closed).toEqual([]);
        expect(
            el.shadowRoot.querySelector('.cm-attention').textContent
        ).toContain('Write the search, or go back to Conditions.');
    });
});
