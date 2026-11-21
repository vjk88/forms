import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getSpecEnvelope from '@salesforce/apex/FinalSpecController.getSpecEnvelope';

jest.mock('c/finalThemeCatalog', () => ({
    getBuiltinTheme: jest.fn(() => null)
}));
jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpecEnvelope',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

/**
 * The line by the Next / Submit button (IMPL_PLAN_BLOCKED_MESSAGE).
 *
 * Specified in P1 (COMPONENT_CATALOG §1 "Blocked Message") and never wired:
 * the bar could show it, the viewer never told it anything, so a blocked
 * Next just sat there. Now a blocked click lists the questions ("Please fix these to continue:")
 * by the button, counts down as answers are fixed, and names ONE question
 * for the cursor (a fixed target per click). A refused Submit puts its
 * sentence on the same line. The two step-flow layouts are left as they
 * were (owner 2026-10-31).
 */
const req = (id, label = id) => ({
    id,
    type: 'field',
    label,
    required: true,
    binding: { object: 'Contact', field: label },
    render: { inputType: 'text' },
    validation: [{ type: 'required', message: `${label} is required.` }]
});

const page = (id, elements, extra = {}) => ({
    id,
    name: id,
    sections: [
        { id: `sec_${id}`, style: 'plain', columns: 1, elements, ...extra }
    ]
});

const SPEC = (type, pages, options = {}) => ({
    specVersion: 1,
    form: { name: 'Blocked', targetObject: 'Contact' },
    layout: { type, options },
    header: { style: 'none' },
    theme: null,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Send' },
    pages
});

const TWO_ON_ONE = (type, options) =>
    SPEC(
        type,
        [
            page('pg_1', [req('el_a', 'Email'), req('el_b', 'Phone')]),
            page('pg_2', [req('el_c', 'Notes')])
        ],
        options
    );

const flush = () => new Promise((r) => setTimeout(r, 0));

function deepQuery(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
            const found = deepQuery(el.shadowRoot, selector);
            if (found) return found;
        }
    }
    return null;
}

async function mount(spec) {
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.spec = JSON.parse(JSON.stringify(spec));
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

/** Published path: an inline spec SIMULATES submit and never calls Apex. */
async function published(spec) {
    getSpecEnvelope.mockResolvedValue({
        versionId: 'a0Vserved',
        spec: JSON.stringify(spec)
    });
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    document.body.appendChild(el);
    await flush();
    await flush();
    return el;
}

const bar = (el) => deepQuery(el.shadowRoot, 'c-final-submit-bar');
const nav = (el) =>
    el.shadowRoot.querySelector('c-final-page-frame').querySelector('x-test');
// One at a time draws no bar at all: no bar, no line
const line = (el) => (bar(el) ? bar(el).blockedMessage : '');
// the bullets by the button: { key, text }
const items = (el) => (bar(el) ? bar(el).blockedItems.map((i) => i.text) : []);
const click = async (el, intent) => {
    bar(el).dispatchEvent(new CustomEvent(intent));
    await flush();
    await flush();
};
const answer = async (el, elementId, value) => {
    nav(el).dispatchEvent(
        new CustomEvent('valuechange', { detail: { elementId, value } })
    );
    await flush();
};
const elementsOf = (el) =>
    nav(el).pages.flatMap((p) => p.sections.flatMap((s) => s.elements));
const stamped = (el) => elementsOf(el).filter((e) => e.focusRequest);

describe('the count by the Next / Submit button', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('stays quiet until a click is blocked, even with empty required answers', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        expect(line(el)).toBe('');
        await answer(el, 'el_a', '');
        expect(line(el)).toBe('');
    });

    it('a blocked Next says how many, then counts down to nothing as answers are fixed', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        await click(el, 'next');
        expect(line(el)).toBe('Please fix these to continue:');

        await answer(el, 'el_a', 'a@b.co');
        expect(line(el)).toBe('Please fix this to continue:');

        await answer(el, 'el_b', '555');
        expect(line(el)).toBe('');
    });

    it('the wording follows the button: on the last page it says "to submit"', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        await answer(el, 'el_a', 'a@b.co');
        await answer(el, 'el_b', '555');
        await click(el, 'next');
        expect(nav(el).currentPageIndex).toBe(1);

        await click(el, 'submit');
        expect(line(el)).toBe('Please fix this to submit:');
    });

    it('a question a rule hides is never counted', async () => {
        const hidden = {
            ...req('el_h', 'Hidden'),
            visibility: {
                action: 'show',
                logic: 'all',
                rules: [{ source: 'el_a', operator: 'equals', value: 'show' }]
            }
        };
        const el = await mount(
            SPEC('stepper', [
                page('pg_1', [req('el_a', 'Email'), hidden]),
                page('pg_2', [req('el_c', 'Notes')])
            ])
        );
        await click(el, 'next');
        expect(line(el)).toBe('Please fix this to continue:');
    });

    it('names ONE question per blocked click, keeps it fixed while answers change, and a new click gets a new number', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        await click(el, 'next');
        let marks = stamped(el);
        expect(marks.map((e) => e.id)).toEqual(['el_a']);
        const first = marks[0].focusRequest;

        // fixing the first must NOT hand the number to the second — the
        // cursor would leap away mid-typing
        await answer(el, 'el_a', 'a@b.co');
        marks = stamped(el);
        expect(marks.map((e) => e.id)).toEqual(['el_a']);
        expect(marks[0].focusRequest).toBe(first);

        await click(el, 'next');
        marks = stamped(el);
        expect(marks.map((e) => e.id)).toEqual(['el_b']);
        expect(marks[0].focusRequest).toBeGreaterThan(first);
    });

    it('Split with Pane flow = Pages gets the count and the jump like any paged layout', async () => {
        const el = await mount(TWO_ON_ONE('splitHero', { paneFlow: 'pages' }));
        await click(el, 'next');
        expect(line(el)).toBe('Please fix these to continue:');
        expect(stamped(el).map((e) => e.id)).toEqual(['el_a']);
    });
});

describe('Submit finds every problem, marked lookups included', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    const THREE = (type) =>
        SPEC(type, [
            page('pg_1', [req('el_a', 'Email')]),
            page('pg_2', [
                {
                    id: 'el_look',
                    type: 'field',
                    label: 'Account',
                    render: { inputType: 'text' }
                }
            ]),
            page('pg_3', [req('el_c', 'Notes')])
        ]);
    const markLookup = async (el) => {
        el.dispatchEvent(
            new CustomEvent('lookupinvalid', {
                detail: {
                    elementId: 'el_look',
                    invalid: true,
                    message: 'Check this selection.'
                }
            })
        );
        await flush();
    };

    it('Scroll: a marked lookup no longer hides the missing answers on the other pages', async () => {
        const el = await mount(THREE('scroll'));
        await markLookup(el);
        await click(el, 'submit');

        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).toBeNull();
        // every bad page shows its failures at once
        const errored = elementsOf(el).filter(
            (e) => e.errors && e.errors.length
        );
        expect(errored.map((e) => e.id)).toEqual(['el_a', 'el_c']);
        expect(line(el)).toBe('Please fix these to submit:');
        expect(stamped(el).map((e) => e.id)).toEqual(['el_a']);
    });

    it('Tabs: lands on the FIRST bad page in form order, not the lookup page', async () => {
        const el = await mount(THREE('tabs'));
        // walk to the last page, where Submit lives (Tabs move freely)
        nav(el).dispatchEvent(
            new CustomEvent('pagechange', { detail: { index: 2 } })
        );
        await flush();
        await markLookup(el);
        await click(el, 'submit');

        expect(nav(el).currentPageIndex).toBe(0);
        expect(stamped(el).map((e) => e.id)).toEqual(['el_a']);
        expect(line(el)).toBe('Please fix this to continue:');
    });

    it('a marked lookup that a rule hides no longer makes Submit do nothing at all', async () => {
        const el = await mount(
            SPEC('scroll', [
                page('pg_1', [
                    {
                        id: 'el_a',
                        type: 'field',
                        label: 'Driver',
                        render: { inputType: 'text' }
                    },
                    {
                        id: 'el_look',
                        type: 'field',
                        label: 'Account',
                        render: { inputType: 'text' },
                        visibility: {
                            action: 'show',
                            logic: 'all',
                            rules: [
                                {
                                    source: 'el_a',
                                    operator: 'equals',
                                    value: 'show'
                                }
                            ]
                        }
                    }
                ])
            ])
        );
        await markLookup(el);
        await click(el, 'submit');
        // hidden answers never leave the browser (#269), so it goes through
        expect(deepQuery(el.shadowRoot, 'c-final-after-submit')).not.toBeNull();
    });

    it('Accordion counts the whole form, like Scroll', async () => {
        const el = await mount(THREE('accordion'));
        await click(el, 'submit');
        expect(line(el)).toBe('Please fix these to submit:');
        expect(stamped(el).map((e) => e.id)).toEqual(['el_a']);
    });

    it('a folded section holding a red question is told to unfold', async () => {
        const el = await mount(
            SPEC('scroll', [
                page('pg_1', [req('el_a', 'Email')], {
                    title: 'Folded',
                    collapsible: true,
                    defaultCollapsed: true
                })
            ])
        );
        await click(el, 'submit');
        const sec = nav(el).pages[0].sections[0];
        expect(sec.unfoldRequest).toBe(stamped(el)[0].focusRequest);
    });
});

describe('a refused Submit speaks on the same line', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    const PLAIN = SPEC('scroll', [
        page('pg_1', [
            {
                id: 'el_title',
                type: 'field',
                label: 'Title',
                binding: { object: 'Contact', field: 'Title' },
                render: { inputType: 'text' }
            }
        ])
    ]);

    it('the server sentence sits by the button, the refused field gets the cursor, and the next Submit clears it', async () => {
        submitForm.mockResolvedValue({
            errors: [{ message: 'Title is not allowed.', fields: ['Title'] }]
        });
        const el = await published(PLAIN);
        await click(el, 'submit');

        // the heading, then the question and what the server said about it
        expect(line(el)).toBe('Please fix this to submit:');
        expect(items(el)).toEqual(['Title: Title is not allowed.']);
        expect(deepQuery(el.shadowRoot, '.viewer-submit-error')).toBeNull();
        expect(stamped(el).map((e) => e.id)).toEqual(['el_title']);

        // the next Submit clears it the moment it is sent (a pending save,
        // so the thank-you screen does not replace the bar)
        submitForm.mockImplementation(() => new Promise(() => {}));
        await click(el, 'submit');
        expect(bar(el)).not.toBeNull();
        expect(line(el)).toBe('');
    });
});

describe('the step-flow layouts are left as they were (owner 2026-10-31)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it.each([
        ['oneAtATime', {}],
        ['splitHero', { paneFlow: 'oneAtATime' }]
    ])(
        '%s %j: a blocked advance writes no line and names no question',
        async (type, options) => {
            const el = await mount(TWO_ON_ONE(type, options));
            nav(el).dispatchEvent(
                new CustomEvent('advanceblocked', {
                    detail: { pageIndex: 0 }
                })
            );
            await flush();
            expect(line(el)).toBe('');
            expect(stamped(el)).toEqual([]);
        }
    );

    it.each([
        ['oneAtATime', {}],
        ['splitHero', { paneFlow: 'oneAtATime' }]
    ])(
        '%s %j: a failed Submit keeps its banner at the top, since there is no line to carry it',
        async (type, options) => {
            const el = await mount(TWO_ON_ONE(type, options));
            el.failSubmit('Server said no.');
            await flush();
            expect(
                deepQuery(el.shadowRoot, '.viewer-submit-error').textContent
            ).toContain('Server said no.');
            expect(line(el)).toBe('');
        }
    );

    it.each([
        ['oneAtATime', {}],
        ['splitHero', { paneFlow: 'oneAtATime' }]
    ])(
        '%s %j: a server refusal keeps its banner at the top too',
        async (type, options) => {
            submitForm.mockResolvedValue({
                errors: [
                    {
                        message: 'You may not create contacts today.',
                        fields: []
                    }
                ]
            });
            const spec = SPEC(
                type,
                [
                    page('pg_1', [
                        {
                            id: 'el_title',
                            type: 'field',
                            label: 'Title',
                            binding: { object: 'Contact', field: 'Title' },
                            render: { inputType: 'text' }
                        }
                    ])
                ],
                options
            );
            const el = await published(spec);
            nav(el).dispatchEvent(new CustomEvent('submit'));
            await flush();
            await flush();
            expect(
                deepQuery(el.shadowRoot, '.viewer-submit-error').textContent
            ).toContain('You may not create contacts today.');
            expect(line(el)).toBe('');
        }
    );
});

describe('the list of questions by Submit / Next (DEFERRED #68, blocked list)', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    const SEVEN = () =>
        SPEC('scroll', [
            page(
                'pg_1',
                ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n) =>
                    req(`el_${n}`, `Question ${n}`)
                )
            )
        ]);

    it('a blocked Next lists the question NAMES only, and an item leaves as its question is fixed', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        await click(el, 'next');
        expect(line(el)).toBe('Please fix these to continue:');
        expect(items(el)).toEqual(['Email', 'Phone']);

        await answer(el, 'el_a', 'a@b.co');
        expect(line(el)).toBe('Please fix this to continue:');
        expect(items(el)).toEqual(['Phone']);
    });

    it('Submit says "to submit"; Next says "to continue"', async () => {
        const el = await mount(TWO_ON_ONE('stepper'));
        await answer(el, 'el_a', 'a@b.co');
        await answer(el, 'el_b', '555');
        await click(el, 'next');
        await click(el, 'submit');
        expect(line(el)).toBe('Please fix this to submit:');
        expect(items(el)).toEqual(['Notes']);
    });

    it('long lists show the first five, then "and N more"', async () => {
        const el = await mount(SEVEN());
        await click(el, 'submit');
        expect(items(el)).toEqual([
            'Question A',
            'Question B',
            'Question C',
            'Question D',
            'Question E'
        ]);
        expect(bar(el).blockedMore).toBe('and 2 more');
    });

    it('clicking a bullet jumps to that question, not the first red one', async () => {
        const el = await mount(SEVEN());
        await click(el, 'submit');
        expect(stamped(el).map((e) => e.id)).toEqual(['el_A']);
        const third = bar(el).blockedItems[2];
        bar(el).dispatchEvent(
            new CustomEvent('blockedjump', { detail: { key: third.key } })
        );
        await flush();
        expect(stamped(el).map((e) => e.id)).toEqual(['el_C']);
    });

    // answerable but never red on the client: only the server can refuse
    const OPTIONAL = () =>
        SPEC('scroll', [
            page(
                'pg_1',
                ['A', 'B', 'C'].map((n) => ({
                    id: `el_${n}`,
                    type: 'field',
                    label: `Question ${n}`,
                    binding: { object: 'Contact', field: `Question ${n}` },
                    render: { inputType: 'text' }
                }))
            )
        ]);

    it('a refusal names the question and its message; one that names no question is its message only', async () => {
        const el = await mount(OPTIONAL());
        el.failSubmit(null, {
            errors: [
                { message: 'Not allowed.', fields: ['Question B'] },
                { message: 'The form is full today.', fields: [] }
            ]
        });
        await flush();
        expect(line(el)).toBe('Please fix these to submit:');
        expect(items(el)).toEqual([
            'Question B: Not allowed.',
            'The form is full today.'
        ]);
        expect(stamped(el).map((e) => e.id)).toEqual(['el_B']);
    });

    it('a guest refusal routes by question id alone (no field names, no binding in the guest spec)', async () => {
        const spec = OPTIONAL();
        spec.pages.forEach((p) =>
            p.sections.forEach((s) =>
                s.elements.forEach((e) => {
                    delete e.binding; // what projectForGuest sends a guest
                })
            )
        );
        const el = await mount(spec);
        el.failSubmit(null, {
            errors: [
                { message: 'Tell us this.', elementId: 'el_C', fields: [] }
            ]
        });
        await flush();
        expect(items(el)).toEqual(['Question C: Tell us this.']);
        expect(stamped(el).map((e) => e.id)).toEqual(['el_C']);
    });

    it('one question per screen: a refused bullet jumps to that question’s own screen', async () => {
        const spec = TWO_ON_ONE('stepper');
        spec.form.type = 'survey';
        spec.settings.onePerScreen = true;
        const el = await mount(spec);
        el.failSubmit(null, {
            errors: [{ message: 'Bad number.', elementId: 'el_b', fields: [] }]
        });
        await flush();
        expect(items(el)).toEqual(['Phone: Bad number.']);
        bar(el).dispatchEvent(
            new CustomEvent('blockedjump', {
                detail: { key: bar(el).blockedItems[0].key }
            })
        );
        await flush();
        await flush();
        // screens are split per question (sec~el), so the jump must find the
        // screen by the question, not by the spec's section id
        const current = nav(el).pages[nav(el).currentPageIndex];
        const onScreen = current.sections.flatMap((s) =>
            s.elements.map((e) => e.id)
        );
        expect(onScreen).toContain('el_b');
        expect(stamped(el).map((e) => e.id)).toEqual(['el_b']);
    });

    it('a later browser block replaces an old server list', async () => {
        const el = await mount(OPTIONAL());
        el.failSubmit(null, {
            errors: [{ message: 'Not allowed.', fields: ['Question B'] }]
        });
        await flush();
        expect(items(el)).toEqual(['Question B: Not allowed.']);

        // a different question becomes the problem; Submit again
        const spec = OPTIONAL();
        spec.pages[0].sections[0].elements[0].required = true;
        spec.pages[0].sections[0].elements[0].validation = [
            { type: 'required', message: 'Question A is required.' }
        ];
        el.spec = JSON.parse(JSON.stringify(spec));
        await flush();
        await flush();
        el.failSubmit(null, {
            errors: [{ message: 'Not allowed.', fields: ['Question B'] }]
        });
        await flush();
        await click(el, 'submit');
        // the browser's own block speaks now: names only, the new red question
        expect(items(el)).toContain('Question A');
        expect(items(el)).not.toContain('Question B: Not allowed.');
    });

    it('editing a refused question removes its bullet', async () => {
        const el = await mount(OPTIONAL());
        el.failSubmit(null, {
            errors: [{ message: 'Not allowed.', fields: ['Question B'] }]
        });
        await flush();
        expect(items(el)).toHaveLength(1);
        await answer(el, 'el_B', 'changed');
        expect(items(el)).toEqual([]);
    });

    it('One at a time lists the refusal in the banner at the top, each bullet a button', async () => {
        const el = await mount(
            SPEC('oneAtATime', [
                page('pg_1', [req('el_a', 'Email')]),
                page('pg_2', [req('el_b', 'Phone')])
            ])
        );
        el.failSubmit(null, {
            errors: [{ message: 'Bad number.', fields: ['Phone'] }]
        });
        await flush();
        const banner = deepQuery(el.shadowRoot, '.viewer-submit-error');
        expect(banner.textContent).toContain('Please fix this to submit:');
        const link = deepQuery(el.shadowRoot, '.viewer-blocked-link');
        expect(link.textContent.trim()).toBe('Phone: Bad number.');
        link.click();
        await flush();
        expect(stamped(el).map((e) => e.id)).toEqual(['el_b']);
    });
});
