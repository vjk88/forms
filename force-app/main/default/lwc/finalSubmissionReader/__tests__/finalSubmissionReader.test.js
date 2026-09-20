import { createElement } from 'lwc';
import FinalSubmissionReader from 'c/finalSubmissionReader';
import getSubmission from '@salesforce/apex/FinalSubmissionController.getSubmission';

// The reader renders from the version that was FILLED IN (FREEFORM_SPEC D19).
// These tests are mostly about time travel: what a submission looks like
// after the form has moved on.
jest.mock(
    '@salesforce/apex/FinalSubmissionController.getSubmission',
    () => {
        const {
            createApexTestWireAdapter
        } = require('@salesforce/sfdx-lwc-jest');
        return { default: createApexTestWireAdapter(jest.fn()) };
    },
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

function specWith(elements, sectionTitle = 'About you') {
    return JSON.stringify({
        form: { type: 'freeform' },
        pages: [
            {
                id: 'pg_1',
                sections: [{ id: 'sec_1', title: sectionTitle, elements }]
            }
        ]
    });
}

function answer(overrides) {
    return {
        elementKey: 'el_a',
        label: 'Original label',
        answerType: 'Text',
        unparsed: false,
        entryIndex: null,
        text: null,
        number: null,
        checked: false,
        date: null,
        dateTime: null,
        options: null,
        ...overrides
    };
}

async function mount(payload) {
    const el = createElement('c-final-submission-reader', {
        is: FinalSubmissionReader
    });
    el.recordId = 'a0Q1';
    document.body.appendChild(el);
    getSubmission.emit(payload);
    await flush();
    return el;
}

const rows = (el) =>
    [...el.shadowRoot.querySelectorAll('.sr-row')].map((r) => ({
        label: r.querySelector('.sr-label').textContent.trim(),
        value: r.querySelector('.sr-value').textContent.trim()
    }));

const base = {
    submissionNumber: 'FS-00000001',
    formName: 'Partner application',
    versionNumber: 2,
    submittedDate: '2026-09-19T10:00:00.000Z',
    submittedBy: 'Alex Adams',
    completionSeconds: 90,
    files: []
};

describe('c/finalSubmissionReader', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('shows answers in the order the form asked them', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_1', type: 'field', label: 'First question' },
                { id: 'el_2', type: 'field', label: 'Second question' }
            ]),
            answers: [
                answer({ elementKey: 'el_2', text: 'second' }),
                answer({ elementKey: 'el_1', text: 'first' })
            ]
        });
        expect(rows(el)).toEqual([
            { label: 'First question', value: 'first' },
            { label: 'Second question', value: 'second' }
        ]);
    });

    it('uses the wording of the version that was filled in, not today', async () => {
        // The version carries the wording as published; a later rename lives
        // in a different version and must not reach this submission.
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_1', type: 'field', label: 'May we email you?' }
            ]),
            answers: [
                answer({
                    elementKey: 'el_1',
                    label: 'May we email you?',
                    answerType: 'Boolean',
                    checked: true
                })
            ]
        });
        expect(rows(el)).toEqual([
            { label: 'May we email you?', value: 'Yes' }
        ]);
    });

    it('marks a question that was asked and skipped', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_1', type: 'field', label: 'Asked' },
                { id: 'el_2', type: 'field', label: 'Skipped' }
            ]),
            answers: [answer({ elementKey: 'el_1', text: 'given' })]
        });
        expect(rows(el)).toEqual([
            { label: 'Asked', value: 'given' },
            { label: 'Skipped', value: 'No answer' }
        ]);
        expect(el.shadowRoot.querySelector('.sr-skipped')).not.toBeNull();
    });

    it('keeps an answer whose question has since been removed', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_1', type: 'field', label: 'Still here' }
            ]),
            answers: [
                answer({ elementKey: 'el_1', text: 'yes' }),
                answer({
                    elementKey: 'el_gone',
                    label: 'Deleted question',
                    text: 'still meaningful'
                })
            ]
        });
        const found = rows(el);
        expect(found).toContainEqual({
            label: 'Deleted question',
            value: 'still meaningful'
        });
        expect(el.shadowRoot.textContent).toContain(
            'Questions no longer on this form'
        );
    });

    it('shows an unparsed value as raw text with a note', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_n',
                    type: 'field',
                    label: 'How many',
                    config: { inputType: 'number' }
                }
            ]),
            answers: [
                answer({
                    elementKey: 'el_n',
                    answerType: 'Number',
                    unparsed: true,
                    text: 'about ten'
                })
            ]
        });
        expect(rows(el)[0].value).toContain('about ten');
        expect(
            el.shadowRoot.querySelector('.sr-unparsed').textContent
        ).toContain('did not look like a number');
    });

    it('names chosen options using that version choice list', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_pick',
                    type: 'field',
                    label: 'Pick some',
                    config: {
                        inputType: 'picklist',
                        options: [
                            { value: 'a', label: 'Apples' },
                            { value: 'b', label: 'Bananas' }
                        ]
                    }
                }
            ]),
            answers: [
                answer({
                    elementKey: 'el_pick',
                    answerType: 'Options',
                    options: JSON.stringify(['a', 'b'])
                })
            ]
        });
        expect(rows(el)[0].value).toBe('Apples, Bananas');
    });

    it('splits a matrix into one row per statement', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_m',
                    type: 'matrix',
                    label: 'How much do you agree',
                    config: {
                        rows: [
                            { value: 'r1', label: 'It was clear' },
                            { value: 'r2', label: 'It was quick' }
                        ]
                    }
                }
            ]),
            answers: [
                answer({
                    elementKey: 'el_m:r1',
                    answerType: 'Number',
                    number: 4
                }),
                answer({
                    elementKey: 'el_m:r2',
                    answerType: 'Number',
                    number: 2
                })
            ]
        });
        expect(rows(el)).toEqual([
            { label: 'How much do you agree — It was clear', value: '4' },
            { label: 'How much do you agree — It was quick', value: '2' }
        ]);
    });

    it('ignores content blocks, which are not answers', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_rt', type: 'richText', label: 'Some heading' },
                { id: 'el_1', type: 'field', label: 'Real question' }
            ]),
            answers: [answer({ elementKey: 'el_1', text: 'answer' })]
        });
        expect(rows(el)).toEqual([{ label: 'Real question', value: 'answer' }]);
    });

    it('reports a load failure instead of rendering nothing', async () => {
        const el = createElement('c-final-submission-reader', {
            is: FinalSubmissionReader
        });
        el.recordId = 'a0Q1';
        document.body.appendChild(el);
        // the adapter wraps what it is given as error.body
        getSubmission.error({ message: 'No access' });
        await flush();
        expect(el.shadowRoot.querySelector('.sr-error').textContent).toContain(
            'No access'
        );
    });
});
