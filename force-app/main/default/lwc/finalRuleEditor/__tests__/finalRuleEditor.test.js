import { createElement } from 'lwc';
import FinalRuleEditor from 'c/finalRuleEditor';

const SOURCES = [
    { id: 'el_1', label: 'First name' },
    { id: 'el_2', label: 'Newsletter' }
];

function makeIndex(entries) {
    return new Map(entries);
}

function mount(props = {}) {
    const el = createElement('c-final-rule-editor', { is: FinalRuleEditor });
    Object.assign(
        el,
        {
            sources: SOURCES,
            sourceIndex: makeIndex([
                ['el_1', { type: 'field', repeatSectionId: null }],
                ['el_2', { type: 'field', repeatSectionId: null }]
            ]),
            noun: 'field'
        },
        props
    );
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();

describe('c-final-rule-editor', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('empty state hints, + Add rule mints the §7 default config', async () => {
        const el = mount({ value: null });
        await flush();
        expect(el.shadowRoot.querySelector('.re-empty').textContent).toContain(
            'Always visible'
        );
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        el.shadowRoot.querySelector('.re-add').click();
        expect(changes).toEqual([
            {
                value: {
                    action: 'show',
                    logic: 'all',
                    customLogic: null,
                    rules: [{ source: 'el_1', operator: 'equals', value: '' }]
                }
            }
        ]);
    });

    it('edits emit the FULL next config; isBlank drops the value input AND the value', async () => {
        const el = mount({
            value: {
                action: 'show',
                logic: 'all',
                customLogic: null,
                rules: [{ source: 'el_1', operator: 'equals', value: 'Yes' }]
            }
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-value')).not.toBeNull();

        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        const operator = el.shadowRoot.querySelector('.re-operator');
        operator.value = 'isBlank';
        operator.dispatchEvent(new CustomEvent('change'));
        expect(changes[0].value.rules[0]).toEqual({
            source: 'el_1',
            operator: 'isBlank',
            value: null
        });

        el.value = changes[0].value;
        await flush();
        expect(el.shadowRoot.querySelector('.re-value')).toBeNull();
    });

    it('removing the last rule emits null (back to always-visible)', async () => {
        const el = mount({
            value: {
                action: 'hide',
                logic: 'all',
                customLogic: null,
                rules: [{ source: 'el_1', operator: 'isBlank', value: null }]
            }
        });
        await flush();
        const changes = [];
        el.addEventListener('rulechange', (e) => changes.push(e.detail));
        el.shadowRoot.querySelector('.re-x').click();
        expect(changes).toEqual([{ value: null }]);
    });

    it('custom logic shows its input; the engine lint reports malformed expressions and bad scoping', async () => {
        const el = mount({
            sourceIndex: makeIndex([
                ['el_1', { type: 'field', repeatSectionId: null }],
                ['el_2', { type: 'field', repeatSectionId: 'sec_rep' }]
            ]),
            hostRepeatSectionId: null,
            value: {
                action: 'show',
                logic: 'custom',
                customLogic: '1 AND (',
                rules: [{ source: 'el_2', operator: 'equals', value: 'x' }]
            }
        });
        await flush();
        expect(el.shadowRoot.querySelector('.re-custom')).not.toBeNull();
        const problems = el.shadowRoot.querySelector('.re-problems');
        expect(problems.textContent).toContain('malformed');
        expect(problems.textContent).toContain('repeatable section');
    });
});
