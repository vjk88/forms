import { createElement } from 'lwc';
import FinalMappingSoql, {
    displayNames,
    toDisplay,
    toStored,
    unknownNames,
    boxProblems
} from 'c/finalMappingSoql';
import checkConditions from '@salesforce/apex/FinalMappingController.checkConditions';

jest.mock(
    '@salesforce/apex/FinalMappingController.checkConditions',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

const QUESTIONS = [
    { elementKey: 'el_a', label: 'Name', answerType: 'Text', mappable: true },
    { elementKey: 'el_b', label: 'Name', answerType: 'Text', mappable: true },
    {
        elementKey: 'el_c',
        label: 'Name (2)',
        answerType: 'Text',
        mappable: true
    },
    {
        elementKey: 'el_o',
        label: 'Pick several',
        answerType: 'Options',
        mappable: true
    }
];

function mount(value = '') {
    const el = createElement('c-final-mapping-soql', { is: FinalMappingSoql });
    Object.assign(el, {
        questions: QUESTIONS,
        spec: { form: {} },
        actionId: 'act_a',
        value
    });
    document.body.appendChild(el);
    const changes = [];
    el.addEventListener('soqlchange', (e) => changes.push(e.detail.value));
    return { el, changes };
}

const box = (el) => el.shadowRoot.querySelector('.ms-text');
const checkButton = (el) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')].find(
        (b) => b.label === 'Check conditions'
    );
function type(el, text) {
    box(el).value = text;
    box(el).dispatchEvent(new CustomEvent('input'));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('display names (decision 6)', () => {
    it('gives repeated labels distinct names that round-trip to their own id', () => {
        const names = displayNames(QUESTIONS, '');
        const shown = ['el_a', 'el_b', 'el_c'].map((id) => names.get(id));
        expect(new Set(shown).size).toBe(3);
        expect(shown[0]).toBe('Name');
        expect(shown[2]).toBe('Name (2)');
        const stored = '{!el_a} {!el_b} {!el_c}';
        expect(toStored(toDisplay(stored, names), names)).toBe(stored);
    });

    it('keeps two removed questions distinct', () => {
        const stored = 'A = {!el_gone1} AND B = {!el_gone2}';
        const names = displayNames(QUESTIONS, stored);
        const shown = toDisplay(stored, names);
        expect(shown).toBe(
            'A = {removed question 1} AND B = {removed question 2}'
        );
        expect(toStored(shown, names)).toBe(stored);
    });

    it('never touches quoted text', () => {
        const names = displayNames(QUESTIONS, '');
        expect(toStored("Title = '{Name}'", names)).toBe("Title = '{Name}'");
        expect(toDisplay("Title = '{!el_a}'", names)).toBe("Title = '{!el_a}'");
    });

    it('keeps an unknown name as typed and lists it', () => {
        const names = displayNames(QUESTIONS, '');
        expect(toStored('Email = {Nope}', names)).toBe('Email = {Nope}');
        expect(unknownNames('Email = {Nope}', names)).toEqual([
            'There’s no question called "Nope". Use Insert answer.'
        ]);
    });
});

describe('what the box itself refuses', () => {
    const ids = QUESTIONS.map((q) => q.elementKey);

    it('an answer inside quotes would be searched as words', () => {
        const names = displayNames(QUESTIONS, '');
        expect(boxProblems("Email = '{Name}'", names, ids)).toEqual([
            'Remove the quotes around {Name}. Answers are quoted for you.'
        ]);
        expect(boxProblems("Title = '{not a question}'", names, ids)).toEqual(
            []
        );
    });

    it('a deleted question stops Apply here, not only at publish', () => {
        const stored = 'Email = {!el_gone}';
        const names = displayNames(QUESTIONS, stored);
        expect(boxProblems(toDisplay(stored, names), names, ids)).toEqual([
            'The question for {removed question 1} was deleted. Insert a different answer.'
        ]);
    });
});

describe('c-final-mapping-soql', () => {
    it('names answers even when the text arrives before the questions', async () => {
        const el = createElement('c-final-mapping-soql', {
            is: FinalMappingSoql
        });
        el.value = 'LastName = {!el_a}';
        el.questions = QUESTIONS;
        document.body.appendChild(el);
        await flush();
        expect(box(el).value).toBe('LastName = {Name}');
    });

    it('names answers when the questions arrive after it shows', async () => {
        const el = createElement('c-final-mapping-soql', {
            is: FinalMappingSoql
        });
        el.value = 'LastName = {!el_a}';
        document.body.appendChild(el);
        await flush();
        el.questions = QUESTIONS;
        await flush();
        expect(box(el).value).toBe('LastName = {Name}');
    });

    it('shows stored text by name and emits it stored', async () => {
        const { el, changes } = mount('LastName = {!el_a}');
        await flush();
        expect(box(el).value).toBe('LastName = {Name}');
        type(el, 'LastName = {Name (2)}');
        expect(changes).toEqual(['LastName = {!el_c}']);
    });

    it('Insert answer puts the name at the cursor; several-value questions are not offered', async () => {
        const { el, changes } = mount('LastName =  AND Title = null');
        await flush();
        const insert = el.shadowRoot.querySelector('lightning-combobox');
        expect(insert.options.map((o) => o.value)).toEqual([
            'el_a',
            'el_b',
            'el_c'
        ]);
        box(el).setSelectionRange(11, 11);
        insert.dispatchEvent(
            new CustomEvent('change', { detail: { value: 'el_a' } })
        );
        expect(changes[0]).toBe('LastName = {!el_a} AND Title = null');
    });

    it('Check conditions is off with an unknown name', async () => {
        const { el } = mount('');
        type(el, 'Email = {Nope}');
        await flush();
        expect(checkButton(el).disabled).toBe(true);
        // the reason shows while typing, beside the box
        expect(
            el.shadowRoot.querySelector('.ms-problem').textContent
        ).toContain('no question called "Nope"');
        expect(box(el).getAttribute('aria-invalid')).toBe('true');
        expect(el.problems).toHaveLength(1);
        expect(el.reportValidity()).toBe(false);
    });

    it('says the conditions run, and forgets that on the next edit', async () => {
        checkConditions.mockResolvedValue([]);
        const { el } = mount('LastName = {!el_a}');
        await flush();
        checkButton(el).click();
        await flush();
        expect(checkConditions).toHaveBeenCalledWith({
            specJson: JSON.stringify({ form: {} }),
            actionId: 'act_a',
            soql: 'LastName = {!el_a}'
        });
        expect(el.shadowRoot.querySelector('.ms-check').textContent).toContain(
            'These conditions run.'
        );
        type(el, 'LastName = {Name} ');
        await flush();
        expect(
            el.shadowRoot.querySelector('.ms-check').textContent
        ).not.toContain('These conditions run.');
    });

    it('lists blockers and warnings, each on its own line', async () => {
        checkConditions.mockResolvedValue([
            { severity: 'blocker', message: 'Bad field' },
            { severity: 'warning', message: 'Can be skipped' }
        ]);
        const { el } = mount('Nope__c = 1');
        await flush();
        checkButton(el).click();
        await flush();
        const lines = [...el.shadowRoot.querySelectorAll('.ms-line')];
        expect(lines.map((l) => l.textContent.trim())).toEqual([
            'Bad field',
            'Can be skipped'
        ]);
        expect(
            lines.map((l) => l.querySelector('lightning-icon').iconName)
        ).toEqual(['utility:error', 'utility:warning']);
    });

    it('says when the check itself failed', async () => {
        checkConditions.mockRejectedValue(new Error('down'));
        const { el } = mount('LastName = {!el_a}');
        await flush();
        checkButton(el).click();
        await flush();
        expect(el.shadowRoot.querySelector('.ms-check').textContent).toContain(
            'The check couldn’t run. Try again.'
        );
    });
});
