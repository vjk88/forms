import { LightningElement, api, wire } from 'lwc';
import getSubmission from '@salesforce/apex/FinalSubmissionController.getSubmission';

/**
 * Reads one Freeform submission back, in the form's own order (FREEFORM_SPEC §8).
 *
 * Everything on screen comes from the version that was FILLED IN — wording,
 * choices, sections and order (D19). A question renamed since then still
 * reads as it was answered, and a question added since then is absent rather
 * than appearing as "No answer", because it was never asked.
 *
 * Three states a reader must be able to tell apart:
 *   - answered            → the value
 *   - asked but skipped    → "No answer"
 *   - asked, answered, but the value did not match its type → the raw text,
 *     with a quiet note (Value_Unparsed__c)
 */
export default class FinalSubmissionReader extends LightningElement {
    @api recordId;

    data;
    error;

    @wire(getSubmission, { submissionId: '$recordId' })
    wired({ data, error }) {
        if (data) {
            this.data = data;
            this.error = undefined;
        } else if (error) {
            this.data = undefined;
            this.error =
                (error.body && error.body.message) ||
                'This submission could not be loaded.';
        }
    }

    get hasData() {
        return Boolean(this.data);
    }

    get header() {
        if (!this.data) {
            return {};
        }
        return {
            formName: this.data.formName,
            submissionNumber: this.data.submissionNumber,
            submittedBy: this.data.submittedBy || 'Someone not signed in',
            submittedDate: this.data.submittedDate,
            versionLabel: this.data.versionNumber
                ? `Version ${this.data.versionNumber}`
                : ''
        };
    }

    get files() {
        return (this.data && this.data.files) || [];
    }

    get hasFiles() {
        return this.files.length > 0;
    }

    /** answers keyed by element id; matrix rows keep their composite key. */
    get _answersByKey() {
        const map = new Map();
        for (const a of (this.data && this.data.answers) || []) {
            const list = map.get(a.elementKey) || [];
            list.push(a);
            map.set(a.elementKey, list);
        }
        return map;
    }

    get _spec() {
        try {
            return JSON.parse((this.data && this.data.specJson) || '{}');
        } catch {
            return {};
        }
    }

    /**
     * The submission as the form asked it: sections and questions in the
     * order of the version that was filled in.
     */
    get sections() {
        if (!this.data) {
            return [];
        }
        const answers = this._answersByKey;
        const seen = new Set();
        const out = [];
        for (const page of this._spec.pages || []) {
            for (const section of page.sections || []) {
                const rows = [];
                for (const el of section.elements || []) {
                    if (!el || !el.id || !isQuestion(el)) {
                        continue;
                    }
                    const mine = collectFor(el.id, answers, seen);
                    rows.push(...renderQuestion(el, mine));
                }
                if (rows.length) {
                    out.push({
                        key: section.id || `sec-${out.length}`,
                        title: section.title || '',
                        rows
                    });
                }
            }
        }
        // Answers whose question is gone from this version cannot be placed
        // in the form's order, but they were still given — they keep the
        // wording they were submitted under.
        const orphans = [];
        for (const [key, list] of answers) {
            if (seen.has(key)) {
                continue;
            }
            for (const a of list) {
                orphans.push({
                    key: `${key}-${orphans.length}`,
                    label: a.label || key,
                    value: displayValue(a, null),
                    answered: true,
                    unparsed: a.unparsed,
                    note: a.unparsed ? unparsedNote(a) : ''
                });
            }
        }
        if (orphans.length) {
            out.push({
                key: 'removed-questions',
                title: 'Questions no longer on this form',
                rows: orphans
            });
        }
        return out;
    }
}

/** Content blocks and file uploads are not answers. */
function isQuestion(el) {
    return (
        el.type !== 'richText' &&
        el.type !== 'image' &&
        el.type !== 'callout' &&
        el.type !== 'divider' &&
        el.type !== 'spacer' &&
        el.type !== 'file'
    );
}

function collectFor(elementId, answers, seen) {
    const exact = answers.get(elementId) || [];
    if (exact.length) {
        seen.add(elementId);
    }
    // matrix rows are stored as '<elementId>:<statementKey>'
    const matrix = [];
    for (const [key, list] of answers) {
        if (key.startsWith(`${elementId}:`)) {
            seen.add(key);
            for (const a of list) {
                matrix.push({ statement: key.slice(elementId.length + 1), a });
            }
        }
    }
    return { exact, matrix };
}

function renderQuestion(el, mine) {
    const label = el.label || el.id;
    if (mine.matrix.length) {
        return mine.matrix.map(({ statement, a }) => ({
            key: `${el.id}-${statement}`,
            label: `${label} — ${statementLabel(el, statement)}`,
            value: displayValue(a, el),
            answered: true,
            unparsed: a.unparsed,
            note: a.unparsed ? unparsedNote(a) : ''
        }));
    }
    if (!mine.exact.length) {
        // asked, and deliberately left alone
        return [
            {
                key: el.id,
                label,
                value: 'No answer',
                answered: false,
                unparsed: false,
                note: ''
            }
        ];
    }
    return mine.exact.map((a, i) => ({
        key: mine.exact.length > 1 ? `${el.id}-${i}` : el.id,
        label:
            a.entryIndex === null || a.entryIndex === undefined
                ? label
                : `${label} (entry ${a.entryIndex + 1})`,
        value: displayValue(a, el),
        answered: true,
        unparsed: a.unparsed,
        note: a.unparsed ? unparsedNote(a) : ''
    }));
}

function statementLabel(el, statementValue) {
    const rows = (el.config && el.config.rows) || [];
    const hit = rows.find((r) => String(r.value) === statementValue);
    return hit ? hit.label || hit.value : statementValue;
}

function unparsedNote(a) {
    return `Stored as text — this did not look like a ${String(
        a.answerType || ''
    ).toLowerCase()}.`;
}

/**
 * The stored answer as text, chosen by Answer_Type__c.
 *
 * The type is what makes the six value columns readable: without it, an
 * unticked checkbox column and "not a boolean question" look identical.
 */
function displayValue(a, el) {
    if (a.unparsed) {
        return a.text;
    }
    switch (a.answerType) {
        case 'Boolean':
            return a.checked ? 'Yes' : 'No';
        case 'Number':
            return a.number === null || a.number === undefined
                ? ''
                : String(a.number);
        case 'Date':
            return a.date || '';
        case 'DateTime':
            return a.dateTime ? new Date(a.dateTime).toLocaleString() : '';
        case 'Options':
            return optionLabels(a, el);
        default:
            return a.text || '';
    }
}

/** Stored values are keys; the version's own choice list gives them names. */
function optionLabels(a, el) {
    let values = [];
    try {
        values = JSON.parse(a.options || '[]');
    } catch {
        return a.options || '';
    }
    const options = (el && el.config && el.config.options) || [];
    return values
        .map((v) => {
            const hit = options.find((o) => String(o.value) === String(v));
            return hit ? hit.label || hit.value : v;
        })
        .join(', ');
}
