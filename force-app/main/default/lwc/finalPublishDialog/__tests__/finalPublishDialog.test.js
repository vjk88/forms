import { createElement } from 'lwc';
import FinalPublishDialog from 'c/finalPublishDialog';

/**
 * The publish dialog exists because LightningConfirm could not hold more than
 * a sentence. It took a plain string, so three warnings arrived as one
 * paragraph with stray bullet characters mid-sentence, and the standing "the
 * live form updates immediately" note sat where it read as part of the last
 * warning.
 *
 * So what is under test is separability: one warning, one row, and the note
 * outside all of them.
 */
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount({
    formName = 'Untitled Freeform',
    warnings = [],
    blockers = [],
    items = []
} = {}) {
    const el = createElement('c-final-publish-dialog', {
        is: FinalPublishDialog
    });
    el.formName = formName;
    el.warnings = warnings;
    el.blockers = blockers;
    el.items = items;
    document.body.appendChild(el);
    return el;
}

const rows = (el) =>
    [...el.shadowRoot.querySelectorAll('.pd-line-text')].map((n) =>
        n.textContent.trim()
    );

const heading = (el) =>
    el.shadowRoot.querySelector('lightning-modal-header').label;

const confirmButton = (el) =>
    [...el.shadowRoot.querySelectorAll('lightning-button')].find(
        (b) => b.variant === 'brand'
    );

describe('c-final-publish-dialog', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('gives every warning its own row instead of one paragraph', async () => {
        const el = mount({
            warnings: [
                'You are removing "Phone number", which already has answers.',
                '"File Upload" cannot accept files from people who are not signed in.'
            ]
        });
        await flush();

        expect(rows(el)).toEqual([
            'You are removing "Phone number", which already has answers.',
            '"File Upload" cannot accept files from people who are not signed in.'
        ]);
    });

    it('counts the consequences in the heading so nobody stops at the first', async () => {
        const el = mount({ warnings: ['one', 'two', 'three'] });
        await flush();
        expect(heading(el)).toBe('3 things to know before publishing');
    });

    it('says "One thing" rather than "1 things"', async () => {
        const el = mount({ warnings: ['just the one'] });
        await flush();
        expect(heading(el)).toBe('One thing to know before publishing');
    });

    it('keeps the live-form note out of the warning list', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();

        const note = el.shadowRoot.querySelector('.pd-note').textContent.trim();
        expect(note).toBe('The live form updates immediately.');
        // the bug being fixed: it used to be the tail of the last warning
        expect(rows(el).join(' ')).not.toContain('live form');
    });

    it('is an ordinary confirmation when there is nothing to warn about', async () => {
        // a real path: publish always opens this dialog, so that an author
        // publishing the same form twice is not handed a different one
        const el = mount();
        await flush();

        expect(el.shadowRoot.querySelector('.pd-group')).toBeNull();
        expect(heading(el)).toBe('Publish form');
        expect(confirmButton(el).label).toBe('Publish');
        // the note is always true, so it stays
        expect(el.shadowRoot.querySelector('.pd-note')).not.toBeNull();
    });

    it('names the act on the button rather than saying OK', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();
        expect(confirmButton(el).label).toBe('Publish anyway');
    });

    it('asks about the form by name', async () => {
        const el = mount({ formName: 'Partner application' });
        await flush();
        expect(
            el.shadowRoot.querySelector('.pd-question').textContent
        ).toContain('Publish "Partner application"?');
    });

    it('closes true on publish and false on cancel', async () => {
        const el = mount({ warnings: ['a consequence'] });
        await flush();
        const closed = [];
        el.addEventListener('close', (e) => closed.push(e.detail));

        confirmButton(el).click();
        expect(closed).toEqual([true]);

        [...el.shadowRoot.querySelectorAll('lightning-button')]
            .find((b) => b.label === 'Cancel')
            .click();
        expect(closed).toEqual([true, false]);
    });
});

describe('blockers', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('lists blockers and disables Publish', async () => {
        const el = mount({
            formName: 'Partner application',
            blockers: [
                'Step 2 (Contact): choose what happens when a matching record is found.'
            ],
            warnings: ['A warning']
        });
        await flush();
        const blockers = el.shadowRoot.querySelectorAll('.pd-line--blocker');
        expect(blockers).toHaveLength(1);
        expect(blockers[0].textContent).toContain('matching record is found');
        expect(confirmButton(el).disabled).toBe(true);
    });

    it('says what is wrong in the heading', async () => {
        const el = mount({ formName: 'F', blockers: ['a', 'b'] });
        await flush();
        expect(heading(el)).toBe('Fix 2 things before publishing');
    });

    it('keeps Publish enabled with warnings only', async () => {
        const el = mount({ formName: 'F', warnings: ['w'] });
        await flush();
        expect(confirmButton(el).disabled).toBe(false);
    });
});

describe('blocked copy', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('does not promise a live update or say anyway while blocked', async () => {
        const el = mount({ formName: 'F', blockers: ['a'], warnings: ['w'] });
        await flush();
        expect(el.shadowRoot.querySelector('.pd-note')).toBeNull();
        expect(confirmButton(el).label).toBe('Publish');
    });
});

describe('placed where they are fixed (round 2)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const ITEMS = [
        {
            severity: 'warning',
            area: 'data',
            actionId: 'act_1',
            step: 'Step 1 · Account',
            section: 'Create an Account with',
            text: '“Your answer” can be skipped, but it fills Account Name…',
            questionKey: 'el_a',
            elementLabel: 'Your answer',
            questionUse: 'fills Account Name, which Salesforce requires'
        },
        {
            severity: 'blocker',
            area: 'data',
            actionId: 'act_2',
            step: 'Step 2 · Contact',
            section: 'Find an existing Contact where',
            text: 'No condition compares with an answer.'
        },
        {
            severity: 'blocker',
            area: 'data',
            actionId: 'act_3',
            step: 'Step 3 · Contact',
            section: 'Find an existing Contact where',
            text: '“Your answer” can be skipped, but it’s used to find the Contact…',
            questionKey: 'el_a',
            elementLabel: 'Your answer',
            questionUse: 'finds the Contact'
        },
        {
            severity: 'warning',
            area: 'build',
            elementId: 'el_p',
            elementLabel: 'Phone',
            text: 'Answers already collected for "Phone" are stored as text.'
        }
    ];

    const spans = (node) =>
        [...node.querySelectorAll(':scope > span')]
            .map((n) => n.textContent.trim())
            .join(' ');
    const groups = (el) =>
        [...el.shadowRoot.querySelectorAll('.pd-group')].map((g) => ({
            where: g.querySelector('.pd-where')
                ? spans(g.querySelector('.pd-where'))
                : '',
            lead: g.querySelector('.pd-lead')
                ? g.querySelector('.pd-lead').textContent.trim()
                : '',
            lines: [...g.querySelectorAll('.pd-line-text')].map(spans)
        }));

    it('says each thing once, under the place it is fixed', async () => {
        const el = mount({ formName: 'F', items: ITEMS });
        await flush();
        expect(groups(el)).toEqual([
            {
                where: 'Build “Your answer”',
                lead: 'Can be skipped, but these steps need it. Make it required (and not hidden by a rule).',
                lines: [
                    'Step 3 · Contact finds the Contact',
                    'Step 1 · Account fills Account Name, which Salesforce requires'
                ]
            },
            {
                where: 'Data Mapping · Step 2 · Contact',
                lead: '',
                lines: [
                    'Find an existing Contact where No condition compares with an answer.'
                ]
            },
            {
                where: 'Build “Phone”',
                lead: '',
                lines: [
                    'Answers already collected for "Phone" are stored as text.'
                ]
            }
        ]);
        // the skippable question is one thing to fix, however many steps use it
        expect(heading(el)).toBe('Fix 2 things before publishing');
        expect(confirmButton(el).disabled).toBe(true);
    });

    it('Go there closes with where to take the author', async () => {
        const el = mount({ formName: 'F', items: ITEMS });
        const closed = [];
        el.addEventListener('close', (e) => closed.push(e.detail));
        await flush();
        const go = [
            ...el.shadowRoot.querySelectorAll('lightning-button')
        ].filter((b) => b.label === 'Go there');
        expect(go.map((b) => b.title)).toEqual([
            'Go to “Your answer”',
            'Go to Mapping · Step 2 · Contact',
            'Go to “Phone”'
        ]);
        go[1].click();
        expect(closed).toEqual([{ goTo: { mode: 'data', actionId: 'act_2' } }]);
    });
});
