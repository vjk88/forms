import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
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
 *
 * The version is also what turns stored values back into words. A choice is
 * stored as its option VALUE, which is an internal key: "vip" on screen is a
 * leak of how the form was built, not an answer anybody gave.
 */
export default class FinalSubmissionReader extends NavigationMixin(
    LightningElement
) {
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
        return ((this.data && this.data.files) || []).map((f) => ({
            ...f,
            detail: fileDetail(f)
        }));
    }

    get hasFiles() {
        return this.files.length > 0;
    }

    /** Open an attachment in the standard file preview. */
    handleFileOpen(event) {
        const documentId = event.currentTarget.dataset.id;
        if (!documentId) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: { pageName: 'filePreview' },
            state: { selectedRecordId: documentId }
        });
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
                orphans.push(
                    answeredRow(
                        `${key}-${orphans.length}`,
                        a.label || key,
                        a,
                        null
                    )
                );
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
    const statements = matrixStatements(el);
    if (statements.length || mine.matrix.length) {
        return [matrixGroup(el, label, statements, mine.matrix)];
    }
    if (!mine.exact.length) {
        return [skippedRow(el.id, label)]; // asked, and deliberately left alone
    }
    return mine.exact.map((a, i) =>
        answeredRow(
            mine.exact.length > 1 ? `${el.id}-${i}` : el.id,
            a.entryIndex === null || a.entryIndex === undefined
                ? label
                : `${label} (entry ${a.entryIndex + 1})`,
            a,
            el
        )
    );
}

function matrixStatements(el) {
    const rows = (el.config && el.config.rows) || [];
    return rows.filter((r) => r && r.value !== undefined && r.value !== null);
}

/**
 * A matrix question, walked in the VERSION's statement order.
 *
 * Iterating the stored answers instead would put them in whatever order the
 * query returned and drop any statement the person skipped — so a matrix
 * would be the one question type where a skip is invisible.
 */
function matrixGroup(el, label, statements, answered) {
    const byStatement = new Map();
    for (const { statement, a } of answered) {
        byStatement.set(statement, a);
    }
    const lines = [];
    const placed = new Set();
    for (const r of statements) {
        const value = String(r.value);
        placed.add(value);
        const a = byStatement.get(value);
        const text = r.label || value;
        lines.push(
            a
                ? answeredRow(`${el.id}-${value}`, text, a, el)
                : skippedRow(`${el.id}-${value}`, text)
        );
    }
    // A statement answered under an earlier version keeps its answer, under
    // its own key — the same courtesy the orphan section gives a question.
    for (const [value, a] of byStatement) {
        if (!placed.has(value)) {
            lines.push(answeredRow(`${el.id}-${value}`, value, a, el));
        }
    }
    return { key: el.id, label, isMatrix: true, answered: true, lines };
}

function answeredRow(key, label, a, el) {
    return {
        key,
        label,
        ...displayValue(a, el),
        answered: true,
        unparsed: a.unparsed,
        note: a.unparsed ? unparsedNote(a) : ''
    };
}

function skippedRow(key, label) {
    return {
        key,
        label,
        value: 'No answer',
        isText: true,
        answered: false,
        unparsed: false,
        note: ''
    };
}

function unparsedNote(a) {
    return `Stored as text — this did not look like a ${String(
        a.answerType || ''
    ).toLowerCase()}.`;
}

/**
 * The stored answer, ready to render, chosen by Answer_Type__c.
 *
 * The type is what makes the six value columns readable: without it, an
 * unticked checkbox column and "not a boolean question" look identical. It
 * also decides the SHAPE — an email is a link, a date is localized text — so
 * this returns the flags the template branches on rather than a bare string.
 */
function displayValue(a, el) {
    if (a.unparsed) {
        return plain(a.text);
    }
    switch (a.answerType) {
        case 'Boolean':
            return plain(a.checked ? 'Yes' : 'No');
        case 'Number':
            return plain(
                a.number === null || a.number === undefined
                    ? ''
                    : String(a.number)
            );
        case 'Date':
            return plain(a.date || '');
        case 'DateTime':
            return plain(
                a.dateTime ? new Date(a.dateTime).toLocaleString() : ''
            );
        case 'Options':
            return plain(optionLabels(a, el));
        case 'Choice':
            // Single and multiple choice are the same thing at different
            // cardinalities. They read through the SAME resolver, which is
            // exactly what was missing: Options resolved labels, Choice fell
            // through to raw text, and nothing connected the two.
            return plain(optionLabel(a.text, optionsOf(el)));
        case 'Email':
            return { value: a.text || '', isEmail: true };
        case 'Phone':
            return { value: a.text || '', isPhone: true };
        case 'URL':
            return { value: a.text || '', isUrl: true };
        default:
            return plain(a.text || '');
    }
}

function plain(value) {
    return { value, isText: true };
}

function optionsOf(el) {
    return (el && el.config && el.config.options) || [];
}

/** Stored values are keys; the version's own choice list gives them names. */
function optionLabels(a, el) {
    let values = [];
    try {
        values = JSON.parse(a.options || '[]');
    } catch {
        return a.options || '';
    }
    const options = optionsOf(el);
    return values.map((v) => optionLabel(v, options)).join(', ');
}

/**
 * One stored choice value, as a person should read it.
 *
 * `options` is the choice list from the version that was FILLED IN, each
 * entry `{ value, label }`. `value` is what was stored — an internal key
 * like "vip", never the wording.
 *
 * Comparison is by string: a spec authored with numeric option values stores
 * "1" and declares 1, and those must still be the same option.
 *
 * An unmatched value falls back to the key itself, with no marker attached.
 * That case is not the exception it looks like — the orphan section renders
 * with no element at all, so EVERY answer there arrives here unmatched, and a
 * note on each one would only repeat the heading already above them. Inside a
 * live question it means the author deleted the option after someone picked
 * it; the key is still the truthful answer, and a parenthetical repeated
 * across six selections of a multi-select would cost more than it explains.
 */
function optionLabel(value, options) {
    if (value === null || value === undefined) {
        return '';
    }
    const key = String(value);
    const hit = (options || []).find((o) => o && String(o.value) === key);
    if (!hit) {
        return key;
    }
    // An option may carry a value and no wording; the key is then all the
    // name it ever had.
    return hit.label === null ||
        hit.label === undefined ||
        String(hit.label).trim() === ''
        ? key
        : hit.label;
}

function fileDetail(f) {
    const parts = [];
    if (f.extension) {
        parts.push(String(f.extension).toUpperCase());
    }
    if (typeof f.size === 'number' && f.size > 0) {
        const mb = f.size / (1024 * 1024);
        parts.push(
            mb >= 1
                ? `${mb.toFixed(1)} MB`
                : `${Math.max(1, Math.round(f.size / 1024))} KB`
        );
    }
    return parts.join(' · ');
}
