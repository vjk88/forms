import { LightningElement, api, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getSubmission from '@salesforce/apex/FinalSubmissionController.getSubmission';
import getPdfImages from '@salesforce/apex/FinalPdfController.getImages';
import {
    matrixAnswerWord,
    optionLabel,
    storedAnswerLines
} from 'c/finalAnswerText';
import { localizeAssetUrls } from 'c/finalThemeAssets';
import { buildReaderDocument, pdfFileName } from 'c/finalPdfModel';
import { downloadPdf } from 'c/finalPdfService';
import LOCALE from '@salesforce/i18n/locale';

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
    pdfBusy = false;
    pdfError;

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

    get pdfLabel() {
        return this.pdfBusy ? 'Preparing PDF…' : 'Download PDF';
    }

    /**
     * The submission as a branded PDF (IMPL_PLAN_FORM_PDF §6.2): the rows
     * on this card, in the colors and fonts of the version that was filled
     * in (its frozen `resolved.tokens`), with images read in user mode.
     */
    async handleDownloadPdf() {
        if (!this.data || this.pdfBusy) {
            return;
        }
        this.pdfBusy = true;
        this.pdfError = undefined;
        try {
            const spec = this._spec;
            const doc = buildReaderDocument({
                spec,
                header: this.header,
                sections: this.sections,
                files: this.files,
                locale: LOCALE
            });
            const tokens = localizeAssetUrls(
                (spec.resolved && spec.resolved.tokens) || {}
            );
            await downloadPdf({
                component: this,
                doc,
                tokens,
                loadImages: (versionIds) => getPdfImages({ versionIds }),
                fileName: pdfFileName(
                    doc.title,
                    this.data.submissionNumber || 'answers'
                )
            });
        } catch (e) {
            this.pdfError = e && e.message;
        } finally {
            this.pdfBusy = false;
        }
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
                ? matrixRow(`${el.id}-${value}`, text, a, el)
                : skippedRow(`${el.id}-${value}`, text)
        );
    }
    // A statement answered under an earlier version keeps its answer, under
    // its own key — the same courtesy the orphan section gives a question.
    for (const [value, a] of byStatement) {
        if (!placed.has(value)) {
            lines.push(matrixRow(`${el.id}-${value}`, value, a, el));
        }
    }
    return { key: el.id, label, isMatrix: true, answered: true, lines };
}

function answeredRow(key, label, a, el) {
    const row = {
        key,
        label,
        ...displayValue(a, el),
        answered: true,
        unparsed: a.unparsed,
        note: a.unparsed ? unparsedNote(a) : ''
    };
    // A consent answer carries the statement that was agreed to, so the PDF
    // can print WHAT was agreed, not just "Agreed" (IMPL_PLAN_FORM_PDF §6.2).
    if (el && el.type === 'consent') {
        row.consent = {
            html: (el.config && el.config.html) || '',
            checked: Boolean(a.checked)
        };
    }
    return row;
}

/** One matrix statement: its chosen scale point, by name. */
function matrixRow(key, label, a, el) {
    if (a.unparsed) {
        return answeredRow(key, label, a, null);
    }
    const stored =
        a.number !== null && a.number !== undefined ? a.number : a.text;
    return {
        key,
        label,
        value: matrixAnswerWord(el, stored) || String(stored ?? ''),
        isText: true,
        answered: true,
        unparsed: false,
        note: ''
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
    // Links stay links.
    if (a.answerType === 'Email') {
        return { value: a.text || '', isEmail: true };
    }
    if (a.answerType === 'Phone') {
        return { value: a.text || '', isPhone: true };
    }
    if (a.answerType === 'URL') {
        return { value: a.text || '', isUrl: true };
    }
    // A question the version still has reads through the shared wording
    // (c/finalAnswerText): "3 out of 10", "Agree", a numbered ranking, a
    // local date — exactly what the respondent's own PDF copy says.
    if (el) {
        return plain(storedAnswerLines(a, el, { locale: LOCALE }).join('\n'));
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
