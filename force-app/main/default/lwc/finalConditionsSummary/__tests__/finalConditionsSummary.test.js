import { createElement } from 'lwc';
import FinalConditionsSummary, {
    describeCondition
} from 'c/finalConditionsSummary';
import FinalConditionsModal from 'c/finalConditionsModal';

jest.mock('c/finalConditionsModal', () => ({
    __esModule: true,
    default: { open: jest.fn() }
}));

/**
 * The summary has to explain the conditions without reopening them: each
 * one in words, numbered so the logic line means something, in the labels
 * the author picked from — not API names.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

const SOURCES = [
    { id: 'el_1', label: 'Contact email' },
    { id: 'el_2', label: 'Newsletter' }
];

function mount(props) {
    const el = createElement('c-final-conditions-summary', {
        is: FinalConditionsSummary
    });
    Object.assign(el, { sources: SOURCES, label: 'Visibility — Email' }, props);
    document.body.appendChild(el);
    return el;
}

const texts = (el, selector) =>
    [...el.shadowRoot.querySelectorAll(selector)].map((n) =>
        n.textContent.trim()
    );

const rule = (source, operator, value) => ({ source, operator, value });

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('describeCondition', () => {
    it('names the answer a mapping row compares with, or says it is gone', () => {
        const labels = new Map([['$field.el_n', 'Your surname']]);
        expect(
            describeCondition(
                {
                    source: 'LastName',
                    operator: 'equals',
                    value: '$field.el_n'
                },
                new Map([...labels, ['LastName', 'Last Name']]),
                new Map(),
                false,
                true
            )
        ).toBe('Last Name equals the answer to “Your surname”');
        expect(
            describeCondition(
                {
                    source: 'LastName',
                    operator: 'equals',
                    value: '$field.el_x'
                },
                new Map([['LastName', 'Last Name']]),
                new Map(),
                false,
                true
            )
        ).toBe('Last Name equals the answer to a removed question');
    });

    const labels = new Map([
        ['el_1', 'Contact email'],
        ['record:Industry', 'Industry']
    ]);

    it.each([
        [rule('el_1', 'equals', 'a@b.com'), 'Contact email equals “a@b.com”'],
        [rule('el_1', 'notEquals', 'x'), 'Contact email does not equal “x”'],
        [rule('el_1', 'contains', 'x'), 'Contact email contains “x”'],
        [rule('el_1', 'greaterThan', '3'), 'Contact email is greater than “3”'],
        [rule('el_1', 'lessThan', '3'), 'Contact email is less than “3”'],
        [rule('el_1', 'isBlank', null), 'Contact email is blank'],
        [rule('el_1', 'isNotBlank', null), 'Contact email is not blank'],
        [rule('el_1', 'lte', '3'), 'Contact email is at most “3”'],
        [rule('el_1', 'gte', '3'), 'Contact email is at least “3”'],
        [
            rule('el_1', 'in', 'Web, Phone'),
            'Contact email is one of “Web”, “Phone”'
        ],
        [rule('el_1', 'nin', 'Web'), 'Contact email is not one of “Web”'],
        [rule('el_1', 'includes', 'A'), 'Contact email includes any of “A”'],
        [rule('el_1', 'excludes', 'A'), 'Contact email excludes all of “A”'],
        [rule('el_1', 'equals', ''), 'Contact email equals “”']
    ])('%p reads %p', (r, text) => {
        expect(describeCondition(r, labels)).toBe(text);
    });

    it('names the linked record, and a removed source in words — never an id', () => {
        expect(
            describeCondition(rule('record:Industry', 'equals', 'Tech'), labels)
        ).toBe('Linked record › Industry equals “Tech”');
        expect(
            describeCondition(rule('record:Region__c', 'isBlank'), labels)
        ).toBe('Removed field (Region__c) is blank');
        expect(describeCondition(rule('el_gone', 'isBlank'), labels)).toBe(
            'Removed question is blank'
        );
        // on a record screen a field path means something, so it stays
        expect(
            describeCondition(
                rule('Account.Type', 'isBlank'),
                labels,
                new Map(),
                false
            )
        ).toBe('Account.Type (not available) is blank');
    });

    it('reads a checkbox as True or False', () => {
        const types = new Map([['el_2', 'checkbox']]);
        expect(
            describeCondition(
                rule('el_2', 'equals', 'true'),
                new Map([['el_2', 'Newsletter']]),
                types
            )
        ).toBe('Newsletter equals True');
    });
});

describe('c-final-conditions-summary', () => {
    it('with none, says so and offers Add conditions', async () => {
        const el = mount({ value: null });
        await flush();
        expect(texts(el, '.cs-empty')).toEqual(['Always shown']);
        expect(el.shadowRoot.querySelector('lightning-button').label).toBe(
            'Add conditions'
        );
        const lookup = mount({ value: null, columns: 'lookup' });
        await flush();
        expect(texts(lookup, '.cs-empty')).toEqual(['No conditions']);
    });

    it('spells each condition out, numbered, with the logic line', async () => {
        const el = mount({
            value: {
                action: 'show',
                logic: 'custom',
                customLogic: '1 AND 2',
                rules: [
                    rule('el_1', 'equals', 'a@b.com'),
                    rule('el_2', 'isNotBlank', null)
                ]
            }
        });
        await flush();
        expect(texts(el, '.cs-heading')).toEqual([
            'Show when custom logic is met:'
        ]);
        expect(texts(el, '.cs-num')).toEqual(['1', '2']);
        expect(texts(el, '.cs-text')).toEqual([
            'Contact email equals “a@b.com”',
            'Newsletter is not blank'
        ]);
        expect(texts(el, '.cs-logic')).toEqual(['Logic: 1 AND 2']);
        expect(el.shadowRoot.querySelector('lightning-button').label).toBe(
            'Edit conditions'
        );
    });

    it.each([
        ['visibility', 'show', 'all', 2, 'Show when all are met:'],
        ['visibility', 'show', 'any', 2, 'Show when any is met:'],
        ['visibility', 'hide', 'all', 2, 'Hide when all are met:'],
        ['visibility', 'show', 'all', 1, 'Show when:'],
        ['lookup', 'show', 'all', 2, 'Only records where all are met:'],
        ['mapping', 'show', 'any', 2, 'Any of these:'],
        ['mapping', 'show', 'all', 2, 'All of these:']
    ])('%s %s %s ×%i reads %p', async (columns, action, logic, n, heading) => {
        const el = mount({
            columns,
            value: {
                action,
                logic,
                customLogic: null,
                rules: Array.from({ length: n }, () =>
                    rule('el_1', 'isBlank', null)
                )
            }
        });
        await flush();
        expect(texts(el, '.cs-heading')).toEqual([heading]);
    });

    it('a single mapping condition needs no heading: the step already says "where"', async () => {
        const el = mount({
            columns: 'mapping',
            value: {
                action: 'show',
                logic: 'all',
                customLogic: null,
                rules: [rule('el_1', 'isBlank', null)]
            }
        });
        await flush();
        expect(texts(el, '.cs-heading')).toEqual([]);
    });

    it('shows five and says how many more', async () => {
        const el = mount({
            value: {
                action: 'show',
                logic: 'all',
                customLogic: null,
                rules: Array.from({ length: 8 }, () =>
                    rule('el_1', 'isBlank', null)
                )
            }
        });
        await flush();
        expect(texts(el, '.cs-text')).toHaveLength(5);
        expect(texts(el, '.cs-more')).toEqual(['+ 3 more']);
    });

    it('opens the dialog with its inputs and emits only what was applied', async () => {
        const value = {
            action: 'show',
            logic: 'all',
            customLogic: null,
            rules: [rule('el_1', 'isBlank', null)]
        };
        const el = mount({ value, noun: 'section', columns: 'visibility' });
        await flush();
        const heard = [];
        el.addEventListener('conditionschange', (e) => heard.push(e.detail));

        FinalConditionsModal.open.mockResolvedValueOnce(undefined);
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        expect(FinalConditionsModal.open).toHaveBeenCalledWith(
            expect.objectContaining({
                label: 'Visibility — Email',
                columns: 'visibility',
                noun: 'section',
                value,
                sources: SOURCES
            })
        );
        expect(heard).toEqual([]);

        FinalConditionsModal.open.mockResolvedValueOnce({ value: null });
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        expect(heard).toEqual([{ value: null }]);
    });

    it('with none, the dialog opens with one row ready', async () => {
        const el = mount({ value: null });
        await flush();
        FinalConditionsModal.open.mockResolvedValueOnce(undefined);
        el.shadowRoot.querySelector('lightning-button').click();
        await flush();
        expect(FinalConditionsModal.open.mock.calls[0][0].startWithRow).toBe(
            true
        );
    });

    it('opens one dialog however fast the clicks', async () => {
        const el = mount({ value: null });
        await flush();
        let finish;
        FinalConditionsModal.open.mockReturnValueOnce(
            new Promise((r) => {
                finish = r;
            })
        );
        const button = el.shadowRoot.querySelector('lightning-button');
        button.click();
        button.click();
        expect(FinalConditionsModal.open).toHaveBeenCalledTimes(1);
        finish(undefined);
        await flush();
    });

    it('the button is off while its fields load', async () => {
        const el = mount({ value: null, disabled: true });
        await flush();
        expect(el.shadowRoot.querySelector('lightning-button').disabled).toBe(
            true
        );
    });
});

describe('current user in words', () => {
    it('reads a $User value and a user: source as Current user', () => {
        const labels = new Map([
            ['$User.Profile.Name', 'Current user › Profile name'],
            ['user:UserRole.Name', 'Current user › Role name']
        ]);
        expect(
            describeCondition(
                rule('Title', 'equals', '$User.Profile.Name'),
                labels,
                new Map(),
                false
            )
        ).toBe('Title (not available) equals Current user › Profile name');
        expect(
            describeCondition(
                rule('user:UserRole.Name', 'equals', 'Sales'),
                labels
            )
        ).toBe('Current user › Role name equals “Sales”');
        // before its label loads, still never an id or "removed"
        expect(
            describeCondition(rule('user:Title', 'isBlank'), new Map())
        ).toBe('Current user › Title is blank');
    });
});
