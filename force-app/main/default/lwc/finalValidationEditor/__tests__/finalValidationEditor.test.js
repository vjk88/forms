import { createElement } from 'lwc';
import FinalValidationEditor from 'c/finalValidationEditor';

function mount(props = {}) {
    const el = createElement('c-final-validation-editor', {
        is: FinalValidationEditor
    });
    Object.assign(
        el,
        { sources: [{ id: 'el_other', label: 'Confirm email' }] },
        props
    );
    document.body.appendChild(el);
    return el;
}

const flush = () => Promise.resolve();

describe('c-final-validation-editor (presets — no regex for humans)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('+ Add mints the Email preset — a compiled §7 pattern entry, never a regex input', async () => {
        const el = mount({ entries: [] });
        await flush();
        expect(el.shadowRoot.querySelector('.ve-empty').textContent).toContain(
            'no formulas needed'
        );
        const changes = [];
        el.addEventListener('validationchange', (e) => changes.push(e.detail));
        el.shadowRoot.querySelector('.ve-add').click();
        const entry = changes[0].entries[0];
        expect(entry.type).toBe('pattern');
        expect(entry.preset).toBe('email');
        expect(entry.pattern).toBeTruthy();
        expect(new RegExp(entry.pattern).test('a@b.co')).toBe(true);
        expect(new RegExp(entry.pattern).test('nope')).toBe(false);

        // the UI never shows the regex
        await flush();
        el.entries = changes[0].entries;
        await flush();
        expect(el.shadowRoot.textContent).not.toContain('@');
    });

    it('preset switch resets the shape (message survives); the roster is the §4 six', async () => {
        const el = mount({
            entries: [
                {
                    type: 'pattern',
                    preset: 'email',
                    pattern: 'x',
                    message: 'Custom msg'
                }
            ]
        });
        await flush();
        const options = [
            ...el.shadowRoot.querySelectorAll('.ve-type option')
        ].map((o) => o.textContent);
        expect(options).toEqual([
            'Email format',
            'Phone format',
            'Web address',
            'Number range',
            'Text length',
            'Match another answer'
        ]);

        const changes = [];
        el.addEventListener('validationchange', (e) => changes.push(e.detail));
        const type = el.shadowRoot.querySelector('.ve-type');
        type.value = 'match';
        type.dispatchEvent(new CustomEvent('change'));
        expect(changes[0].entries[0]).toEqual({
            type: 'custom',
            compareTo: '',
            operator: 'equals',
            message: 'Custom msg'
        });
    });

    it('Text length edits recompile the engine pattern; Number range coerces numbers', async () => {
        const el = mount({
            entries: [
                {
                    type: 'pattern',
                    preset: 'length',
                    minLen: 0,
                    maxLen: 255,
                    pattern: '^[\\s\\S]{0,255}$',
                    message: 'Bad length'
                },
                { type: 'range', min: null, max: null, message: 'Out of range' }
            ]
        });
        await flush();
        const changes = [];
        el.addEventListener('validationchange', (e) => changes.push(e.detail));

        const minLen = el.shadowRoot.querySelector('[data-param="minLen"]');
        minLen.value = '3';
        minLen.dispatchEvent(new CustomEvent('change'));
        const length = changes.at(-1).entries[0];
        expect(length.pattern).toBe('^[\\s\\S]{3,255}$');
        expect(new RegExp(length.pattern).test('ab')).toBe(false);
        expect(new RegExp(length.pattern).test('abc')).toBe(true);

        const min = el.shadowRoot.querySelector('[data-param="min"]');
        min.value = '18';
        min.dispatchEvent(new CustomEvent('change'));
        expect(changes.at(-1).entries[1].min).toBe(18);
    });

    it('Match another answer picks a source; remove empties the list', async () => {
        const el = mount({
            entries: [
                {
                    type: 'custom',
                    compareTo: '',
                    operator: 'equals',
                    message: 'Must match'
                }
            ]
        });
        await flush();
        const changes = [];
        el.addEventListener('validationchange', (e) => changes.push(e.detail));
        const compare = el.shadowRoot.querySelector('[data-param="compareTo"]');
        compare.value = 'el_other';
        compare.dispatchEvent(new CustomEvent('change'));
        expect(changes.at(-1).entries[0].compareTo).toBe('el_other');

        el.shadowRoot.querySelector('.ve-x').click();
        expect(changes.at(-1).entries).toEqual([]);
    });
});
