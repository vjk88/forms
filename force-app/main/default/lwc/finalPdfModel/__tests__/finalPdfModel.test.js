import {
    buildFormDocument,
    buildReaderDocument,
    answerLines,
    richTextParagraphs,
    pdfFileName
} from 'c/finalPdfModel';
import {
    SPEC,
    PAYLOAD
} from '../../finalPdfWriter/__tests__/__fixtures__/pdfFixture';

const byLabel = (doc, label) => doc.blocks.find((b) => b.label === label);

describe('buildFormDocument — answers', () => {
    const doc = buildFormDocument({
        spec: SPEC,
        ...PAYLOAD,
        hiddenKeys: new Set(['el_hidden']),
        submittedAt: '2026-11-02T10:30:00Z',
        locale: 'en-GB'
    });

    it('carries the header and a submitted line', () => {
        expect(doc.title).toBe('Volunteer sign-up');
        expect(doc.brandName).toBe('Green Valley Trust');
        expect(doc.logo.url).toBe('/logo.png');
        expect(doc.metaLines[0]).toMatch(/^Submitted /);
    });

    it('prints choices as their labels, never their stored values', () => {
        expect(byLabel(doc, 'Preferred role').lines).toEqual(['Guided walks']);
    });

    it('never prints a question the rules hid', () => {
        expect(byLabel(doc, 'Hidden by a rule')).toBeUndefined();
        expect(JSON.stringify(doc)).not.toContain('should never print');
    });

    it('words scales, likert, matrix, yes/no and dates', () => {
        expect(
            byLabel(doc, 'How likely are you to recommend us?').lines
        ).toEqual(['9 out of 10']);
        expect(byLabel(doc, 'I enjoy working outdoors').lines).toEqual([
            'Agree'
        ]);
        expect(byLabel(doc, 'Rate these activities').rows).toEqual([
            { label: 'Planting', value: 'Agree', answered: true },
            { label: 'Litter picking', value: 'No answer', answered: false }
        ]);
        expect(byLabel(doc, 'Have you volunteered before?').lines).toEqual([
            'Yes'
        ]);
        expect(byLabel(doc, 'Available from').lines).toEqual([
            '14 November 2026'
        ]);
    });

    it('keeps a multi-line answer as lines', () => {
        expect(byLabel(doc, 'Anything else we should know?').lines).toEqual([
            'I have first-aid training.',
            'Available on weekends only.'
        ]);
    });

    it('lists repeat entries under their own titles', () => {
        const entries = doc.blocks
            .filter((b) => b.kind === 'entry')
            .map((b) => b.title);
        expect(entries).toEqual(['Contact 1', 'Contact 2']);
    });

    it('marks skipped questions and leaves content blocks out of a copy', () => {
        const phones = doc.blocks.filter((b) => b.label === 'Phone');
        expect(phones[1]).toMatchObject({
            lines: ['No answer'],
            answered: false
        });
        expect(
            doc.blocks.some((b) => b.kind === 'text' || b.kind === 'image')
        ).toBe(false);
    });

    it('keeps the consent statement and whether it was agreed', () => {
        const c = doc.blocks.find((b) => b.kind === 'consent');
        expect(c.checked).toBe(true);
        expect(c.paragraphs[0].runs[0].text).toContain('code of conduct');
    });

    it('drops a page or section left empty by the rules', () => {
        const hiddenAll = buildFormDocument({
            spec: SPEC,
            hiddenKeys: [
                'el_name',
                'el_email',
                'el_date',
                'el_role',
                'el_notes',
                'el_hidden'
            ]
        });
        expect(
            hiddenAll.blocks.find(
                (b) => b.kind === 'page' && b.title === 'About you'
            )
        ).toBeUndefined();
    });
});

describe('buildFormDocument — blank', () => {
    const doc = buildFormDocument({ spec: SPEC, mode: 'blank' });

    it('draws answer areas and keeps content blocks', () => {
        expect(byLabel(doc, 'Full name')).toMatchObject({
            kind: 'field',
            required: true,
            lines: 1
        });
        expect(byLabel(doc, 'Anything else we should know?').lines).toBe(4);
        expect(byLabel(doc, 'Preferred role')).toMatchObject({
            kind: 'choices',
            multi: false,
            options: ['Trail maintenance', 'Guided walks', 'Office help']
        });
        expect(
            byLabel(doc, 'How likely are you to recommend us?').points
        ).toHaveLength(11);
        expect(doc.blocks.some((b) => b.kind === 'text')).toBe(true);
        expect(doc.blocks.some((b) => b.kind === 'image')).toBe(true);
        expect(doc.metaLines).toEqual([]);
    });

    it('shows one empty entry for a repeat section', () => {
        expect(doc.blocks.filter((b) => b.kind === 'entry')).toHaveLength(1);
    });
});

describe('answerLines', () => {
    it('prints a lookup by its chosen name, else its value', () => {
        const el = {
            id: 'lk',
            type: 'field',
            config: { inputType: 'reference' }
        };
        expect(
            answerLines(el, '001x', { lookupLabels: { lk: 'Acme' } })
        ).toEqual(['Acme']);
        expect(answerLines(el, '001x', {})).toEqual(['001x']);
    });

    it('numbers a ranking and names uploaded files', () => {
        const rank = {
            type: 'ranking',
            config: {
                options: [
                    { value: 'a', label: 'Alpha' },
                    { value: 'b', label: 'Beta' }
                ]
            }
        };
        expect(answerLines(rank, ['b', 'a'])).toEqual(['1. Beta', '2. Alpha']);
        expect(
            answerLines({ type: 'file' }, [{ name: 'cv.pdf', base64: 'x' }])
        ).toEqual(['cv.pdf']);
    });

    it('treats empty values as unanswered', () => {
        for (const v of [null, undefined, '', [], {}]) {
            expect(answerLines({ type: 'field', config: {} }, v)).toEqual([]);
        }
    });

    it('resolves picklist options compiled into render at publish', () => {
        const el = {
            type: 'field',
            config: { inputType: 'picklist' },
            render: { options: [{ value: 'H', label: 'Hot' }] }
        };
        expect(answerLines(el, 'H')).toEqual(['Hot']);
    });
});

describe('richTextParagraphs', () => {
    it('reads paragraphs, bold runs, lists and entities', () => {
        const p = richTextParagraphs(
            '<p>A &amp; <b>B</b></p><ol><li>one</li><li>two</li></ol><p>x<br>y</p>'
        );
        expect(p[0].runs).toEqual([
            { text: 'A & ', bold: false },
            { text: 'B', bold: true }
        ]);
        expect(p[1].bullet).toBe('1.');
        expect(p[2].bullet).toBe('2.');
        expect(p.slice(3).map((q) => q.runs[0].text)).toEqual(['x', 'y']);
    });

    it('ignores script and junk markup as text-transparent', () => {
        expect(richTextParagraphs('')).toEqual([]);
        expect(richTextParagraphs(null)).toEqual([]);
    });
});

describe('buildReaderDocument', () => {
    it('turns reader rows into blocks with the submission header', () => {
        const doc = buildReaderDocument({
            spec: null,
            header: {
                formName: 'Intake',
                submissionNumber: 'FS-0042',
                submittedBy: 'Jo',
                submittedDate: '2026-11-01T09:00:00Z',
                versionLabel: 'Version 3'
            },
            sections: [
                {
                    key: 's',
                    title: 'Contact',
                    rows: [
                        {
                            key: 'a',
                            label: 'Name',
                            value: 'Jo',
                            answered: true
                        },
                        {
                            key: 'b',
                            label: 'Phone',
                            value: 'No answer',
                            answered: false
                        },
                        {
                            key: 'c',
                            label: 'Consent',
                            value: 'Agreed',
                            answered: true,
                            consent: {
                                html: '<p>I agree to the terms.</p>',
                                checked: true
                            }
                        },
                        {
                            key: 'm',
                            label: 'Rate',
                            isMatrix: true,
                            lines: [
                                {
                                    key: 'l',
                                    label: 'Speed',
                                    value: 'Good',
                                    answered: true
                                }
                            ]
                        }
                    ]
                }
            ],
            files: [{ title: 'id.png', detail: 'PNG · 12 KB' }]
        });
        expect(doc.title).toBe('Intake');
        expect(doc.metaLines[0]).toBe('FS-0042 · Jo');
        expect(doc.metaLines[1]).toContain('Version 3');
        expect(doc.blocks.map((b) => b.kind)).toEqual([
            'section',
            'qa',
            'qa',
            'consent',
            'matrix',
            'section',
            'qa'
        ]);
        const consent = doc.blocks.find((b) => b.kind === 'consent');
        expect(consent.checked).toBe(true);
        expect(consent.paragraphs[0].runs[0].text).toBe(
            'I agree to the terms.'
        );
        expect(doc.footerNote).toBe('Intake · FS-0042');
    });
});

describe('pdfFileName', () => {
    it('strips characters a file system refuses', () => {
        expect(pdfFileName('Q3: "Intake" / form', 'answers')).toBe(
            'Q3 Intake form - answers.pdf'
        );
        expect(pdfFileName('', null)).toBe('Form.pdf');
    });
});
