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

/** The statement lines inside a matrix group, in rendered order. */
const matrixLines = (el) =>
    [...el.shadowRoot.querySelectorAll('.sr-matrix-line')].map((r) => ({
        statement: r.querySelector('.sr-statement').textContent.trim(),
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

    it('groups a matrix under its question, statement by statement', async () => {
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
        expect(rows(el).map((r) => r.label)).toEqual(['How much do you agree']);
        expect(matrixLines(el)).toEqual([
            { statement: 'It was clear', value: '4' },
            { statement: 'It was quick', value: '2' }
        ]);
    });

    // The reader used to walk the stored ANSWERS, so a matrix came out in
    // whatever order the query returned it.
    it('keeps the statement order the version asked in, not the stored order', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_m',
                    type: 'matrix',
                    label: 'Agree?',
                    config: {
                        rows: [
                            { value: 'r1', label: 'First asked' },
                            { value: 'r2', label: 'Second asked' },
                            { value: 'r3', label: 'Third asked' }
                        ]
                    }
                }
            ]),
            // deliberately out of order, as a query may well return them
            answers: [
                answer({ elementKey: 'el_m:r3', text: 'third' }),
                answer({ elementKey: 'el_m:r1', text: 'first' }),
                answer({ elementKey: 'el_m:r2', text: 'second' })
            ]
        });
        expect(matrixLines(el).map((l) => l.statement)).toEqual([
            'First asked',
            'Second asked',
            'Third asked'
        ]);
    });

    // A skipped statement used to vanish entirely, which made a matrix the
    // one question type where a deliberate skip was invisible.
    it('shows a skipped statement as No answer rather than dropping it', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_m',
                    type: 'matrix',
                    label: 'Agree?',
                    config: {
                        rows: [
                            { value: 'r1', label: 'Answered this' },
                            { value: 'r2', label: 'Skipped this' }
                        ]
                    }
                }
            ]),
            answers: [answer({ elementKey: 'el_m:r1', text: 'yes' })]
        });
        expect(matrixLines(el)).toEqual([
            { statement: 'Answered this', value: 'yes' },
            { statement: 'Skipped this', value: 'No answer' }
        ]);
    });

    it('reads a single choice by its label, not its stored key', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_a',
                    type: 'field',
                    label: 'Customer tier',
                    config: {
                        options: [
                            { value: 'vip', label: 'Priority customer' },
                            { value: 'std', label: 'Standard' }
                        ]
                    }
                }
            ]),
            answers: [answer({ answerType: 'Choice', text: 'vip' })]
        });
        expect(rows(el)).toEqual([
            { label: 'Customer tier', value: 'Priority customer' }
        ]);
    });

    it('matches a numeric option value against its stored string', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_a',
                    type: 'field',
                    label: 'How many',
                    config: { options: [{ value: 1, label: 'Just one' }] }
                }
            ]),
            answers: [answer({ answerType: 'Choice', text: '1' })]
        });
        expect(rows(el)[0].value).toBe('Just one');
    });

    // An author who deletes an option does not make the answer untrue.
    it('falls back to the stored key when the option is gone', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                {
                    id: 'el_a',
                    type: 'field',
                    label: 'Customer tier',
                    config: { options: [{ value: 'std', label: 'Standard' }] }
                }
            ]),
            answers: [answer({ answerType: 'Choice', text: 'vip' })]
        });
        expect(rows(el)[0].value).toBe('vip');
    });

    it('renders email, phone and url as links', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_e', type: 'field', label: 'Email' },
                { id: 'el_p', type: 'field', label: 'Phone' },
                { id: 'el_u', type: 'field', label: 'Site' }
            ]),
            answers: [
                answer({
                    elementKey: 'el_e',
                    answerType: 'Email',
                    text: 'a@b.test'
                }),
                answer({
                    elementKey: 'el_p',
                    answerType: 'Phone',
                    text: '555-0100'
                }),
                answer({
                    elementKey: 'el_u',
                    answerType: 'URL',
                    text: 'https://example.test'
                })
            ]
        });
        expect(
            el.shadowRoot.querySelector('lightning-formatted-email').value
        ).toBe('a@b.test');
        expect(
            el.shadowRoot.querySelector('lightning-formatted-phone').value
        ).toBe('555-0100');
        expect(
            el.shadowRoot.querySelector('lightning-formatted-url').value
        ).toBe('https://example.test');
    });

    it('makes an attached file openable rather than just naming it', async () => {
        const el = await mount({
            ...base,
            specJson: specWith([
                { id: 'el_a', type: 'field', label: 'Anything' }
            ]),
            answers: [answer({ text: 'hello' })],
            files: [
                {
                    id: '068000000000001',
                    documentId: '069000000000001',
                    title: 'CV.pdf',
                    extension: 'pdf',
                    size: 2 * 1024 * 1024
                }
            ]
        });
        const open = el.shadowRoot.querySelector('.sr-file-open');
        expect(open.textContent.trim()).toBe('CV.pdf');
        expect(open.dataset.id).toBe('069000000000001');
        expect(
            el.shadowRoot.querySelector('.sr-file-detail').textContent.trim()
        ).toBe('PDF · 2.0 MB');
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
