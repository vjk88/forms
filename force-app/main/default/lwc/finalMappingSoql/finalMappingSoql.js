import { LightningElement, api } from 'lwc';
import checkConditions from '@salesforce/apex/FinalMappingController.checkConditions';

/**
 * finalMappingSoql — the Advanced (SOQL) tab of a find-or-create search
 * (IMPL_PLAN_F2_SEARCH Task 11, D50/D51). The author types the part after
 * WHERE and puts answers in with Insert answer.
 *
 * Stored text names a question by id — `{!el_x}` — so renaming it never
 * breaks the search. The author sees and types its name — `{Your email}` —
 * and names are made one-per-question when labels repeat (decision 6).
 *
 * Emits `soqlchange` { value } with the stored text on every edit.
 * ms- prefixed classes (LEX leak rule).
 */

/** Calls fn(inner, start, end) for each {…} outside quoted text. */
function eachBrace(text, fn) {
    const s = String(text || '');
    let inQuote = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQuote) {
            if (c === '\\') {
                i++;
            } else if (c === "'") {
                inQuote = false;
            }
            continue;
        }
        if (c === "'") {
            inQuote = true;
            continue;
        }
        if (c === '{') {
            const close = s.indexOf('}', i);
            if (close < 0) {
                return;
            }
            fn(s.slice(i + 1, close), i, close + 1);
            i = close;
        }
    }
}

/** Replaces each {…} outside quotes whose inside `swap` maps to text. */
function swapBraces(text, swap) {
    const s = String(text || '');
    let out = '';
    let last = 0;
    eachBrace(s, (inner, start, end) => {
        const next = swap(inner);
        if (next != null) {
            out += s.slice(last, start) + next;
            last = end;
        }
    });
    return out + s.slice(last);
}

const TOKEN = /^![A-Za-z0-9_]+$/;

/**
 * One name per question, in form order: its label, unless another name
 * already equals it; then "Label (2)", "(3)", … — bumped until it equals no
 * real label and no name given. Questions gone from the form but named in
 * the stored text get "removed question 1", "2", … the same way. Each name
 * maps back to exactly one id, so a round trip keeps every id.
 */
export function displayNames(questions, storedText) {
    const names = new Map();
    const labels = new Set((questions || []).map((q) => q.label));
    const taken = new Set();
    (questions || []).forEach((q) => {
        const base = q.label || 'Question';
        let name = base;
        let n = 1;
        // A bumped name must not be some other question's real label either.
        while (taken.has(name) || (n > 1 && labels.has(name))) {
            n++;
            name = `${base} (${n})`;
        }
        taken.add(name);
        names.set(q.elementKey, name);
    });
    let removed = 0;
    eachBrace(storedText, (inner) => {
        if (!TOKEN.test(inner)) {
            return;
        }
        const id = inner.slice(1);
        if (names.has(id)) {
            return;
        }
        removed++;
        let name = `removed question ${removed}`;
        while (taken.has(name) || labels.has(name)) {
            removed++;
            name = `removed question ${removed}`;
        }
        taken.add(name);
        names.set(id, name);
    });
    return names;
}

/** Stored text → what the author sees. */
export function toDisplay(stored, names) {
    return swapBraces(stored, (inner) => {
        const id = TOKEN.test(inner) ? inner.slice(1) : null;
        return id && names.has(id) ? `{${names.get(id)}}` : null;
    });
}

/** What the author typed → stored text. Unknown names stay as typed. */
export function toStored(display, names) {
    const ids = new Map([...names].map(([id, name]) => [name, id]));
    return swapBraces(display, (inner) => {
        return ids.has(inner) ? `{!${ids.get(inner)}}` : null;
    });
}

/** The text inside each quoted value ('…'), escapes kept as typed. */
function quotedValues(text) {
    const s = String(text || '');
    const out = [];
    let current = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (current === null) {
            if (c === "'") {
                current = '';
            }
            continue;
        }
        if (c === '\\' && i + 1 < s.length) {
            current += c + s[i + 1];
            i++;
        } else if (c === "'") {
            out.push(current);
            current = null;
        } else {
            current += c;
        }
    }
    return out;
}

/**
 * Everything the box can see is wrong itself, as the sentences that stop
 * Apply (the server checks the rest):
 * - a {name} that isn't a question;
 * - a question that was deleted since this was written;
 * - an answer inside quotes, which would be searched as those words.
 */
export function boxProblems(display, names, questionIds) {
    const out = unknownNames(display, names);
    const live = new Set(questionIds || []);
    const nameToId = new Map([...names].map(([id, name]) => [name, id]));
    eachBrace(display, (inner) => {
        if (nameToId.has(inner) && !live.has(nameToId.get(inner))) {
            out.push(
                `The question for {${inner}} was deleted. Insert a different answer.`
            );
        }
    });
    const known = new Set(names.values());
    quotedValues(display).forEach((value) => {
        const m = /^\{(.+)\}$/.exec(value.trim());
        if (m && known.has(m[1])) {
            out.push(
                `Remove the quotes around {${m[1]}}. Answers are quoted for you.`
            );
        }
    });
    return out;
}

/** {Name}s that aren't a question, as the sentences that stop Apply. */
export function unknownNames(display, names) {
    const known = new Set(names.values());
    const out = [];
    eachBrace(display, (inner) => {
        if (!known.has(inner)) {
            out.push(
                `There’s no question called "${inner}". Use Insert answer.`
            );
        }
    });
    return out;
}

export default class FinalMappingSoql extends LightningElement {
    _questions = [];
    /** Set once the author types or inserts: names stay put from then on. */
    _edited = false;

    /** The questions on the form ({ elementKey, label, answerType, mappable }). */
    @api
    get questions() {
        return this._questions;
    }
    set questions(next) {
        this._questions = next || [];
        // They can arrive after the box is showing (a dialog sets its parts
        // in any order). Until the author edits, name answers afresh.
        if (this._names && !this._edited) {
            this._names = displayNames(this._questions, this._stored);
            this.display = toDisplay(this._stored, this._names);
        }
    }
    /** The form as it is now and the step, for Check conditions. */
    @api spec;
    @api actionId;

    _names = null;
    _stored = '';
    display = '';

    /** Stored text. Read once into the box; the box is the draft after that. */
    @api
    get value() {
        return this._stored;
    }
    set value(next) {
        const stored = next || '';
        if (this._names && stored === this._stored) {
            return;
        }
        this._stored = stored;
        // A result is about the text it checked (Clear all comes this way).
        this.checked = null;
        this.checkFailed = false;
        // Before connecting, the questions may not have arrived yet (a
        // parent sets its attributes in any order): names wait for them.
        if (this._names) {
            this.display = toDisplay(stored, this._names);
        }
    }

    connectedCallback() {
        // One names map per dialog open, so a rename mid-edit can't shift it.
        this._names = displayNames(this.questions, this._stored);
        this.display = toDisplay(this._stored, this._names);
    }

    /**
     * A textarea takes its text as a property, not from the template: keep
     * it in step with the draft (typing already matches, so this only moves
     * text that came from outside — the saved value, Insert answer, Clear).
     */
    renderedCallback() {
        const box = this.template.querySelector('.ms-text');
        if (box && box.value !== this.display) {
            box.value = this.display;
        }
    }

    /** Problems the box can see itself (the server checks the rest). */
    @api
    get problems() {
        return boxProblems(
            this.display,
            this._names || new Map(),
            (this._questions || []).map((q) => q.elementKey)
        );
    }

    /** Show the box's own problems, and say whether there were none. */
    @api
    reportValidity() {
        this._showProblems = true;
        return this.problems.length === 0;
    }

    @api
    focus() {
        const box = this.template.querySelector('.ms-text');
        if (box) {
            box.focus();
        }
    }

    _showProblems = false;
    checking = false;
    checked = null; // [{ key, severity, message }] or null
    checkFailed = false;

    get shownProblems() {
        return (this._showProblems ? this.problems : []).map((text, i) => ({
            key: `p${i}`,
            text
        }));
    }

    get hint() {
        return (
            'Put each answer right after a field and a comparison, like ' +
            'Email = {Your email}. Check conditions runs the same check ' +
            'publishing does.'
        );
    }

    /** Answers in the text whose question can be skipped (round 1 #5). */
    get skippableNotes() {
        const ids = new Set();
        const names = this._names || new Map();
        const byName = new Map([...names].map(([id, name]) => [name, id]));
        eachBrace(this.display, (inner) => {
            if (byName.has(inner)) {
                ids.add(byName.get(inner));
            }
        });
        return (this._questions || [])
            .filter((q) => q.skippable && ids.has(q.elementKey))
            .map((q) => ({
                key: q.elementKey,
                text: `“${names.get(q.elementKey) || q.label}” can be skipped. Make it required (and not hidden by a rule), or compare with something else.`
            }));
    }

    get hasSkippableNotes() {
        return this.skippableNotes.length > 0;
    }

    get hasShownProblems() {
        return this.shownProblems.length > 0;
    }

    get textClass() {
        return this.hasShownProblems
            ? 'slds-textarea ms-text ms-text--error'
            : 'slds-textarea ms-text';
    }

    get invalid() {
        return this.hasShownProblems ? 'true' : 'false';
    }

    get hasAnswerOptions() {
        return this.answerOptions.length > 0;
    }

    get insertPlaceholder() {
        return this.hasAnswerOptions ? 'Insert answer' : 'No answers to insert';
    }

    get noAnswerOptions() {
        return !this.hasAnswerOptions;
    }

    get answerOptions() {
        return (this.questions || [])
            .filter((q) => q.mappable && q.answerType !== 'Options')
            .map((q) => ({
                value: q.elementKey,
                label: (this._names && this._names.get(q.elementKey)) || q.label
            }));
    }

    get checkDisabled() {
        return (
            this.checking || !this.display.trim() || this.problems.length > 0
        );
    }

    get checkedClean() {
        return Array.isArray(this.checked) && this.checked.length === 0;
    }

    get checkedLines() {
        return (this.checked || []).map((d, i) => ({
            key: `c${i}`,
            message: d.text || d.message,
            icon:
                d.severity === 'warning' ? 'utility:warning' : 'utility:error',
            variant: d.severity === 'warning' ? 'warning' : 'error',
            alt: d.severity === 'warning' ? 'Warning' : 'Error'
        }));
    }

    _setDisplay(text) {
        this._edited = true;
        this.display = text;
        this._stored = toStored(text, this._names || new Map());
        // A result is about the text it checked; any edit makes it stale.
        this.checked = null;
        this.checkFailed = false;
        this.dispatchEvent(
            new CustomEvent('soqlchange', { detail: { value: this._stored } })
        );
    }

    handleInput(event) {
        // Problems show as they are typed, so a greyed-out Check conditions
        // always has its reason beside it.
        this._showProblems = true;
        this._setDisplay(event.target.value);
    }

    /** Puts {Name} at the cursor, then clears the picker for the next one. */
    handleInsert(event) {
        const id = event.detail.value;
        const name = this._names && this._names.get(id);
        const picker = event.target;
        if (name) {
            const box = this.template.querySelector('.ms-text');
            const at =
                box && typeof box.selectionStart === 'number'
                    ? box.selectionStart
                    : this.display.length;
            const end =
                box && typeof box.selectionEnd === 'number'
                    ? box.selectionEnd
                    : at;
            const token = `{${name}}`;
            if (box && typeof box.setRangeText === 'function') {
                // setRangeText keeps the browser's undo (Ctrl+Z) working.
                box.focus();
                box.setRangeText(token, at, end, 'end');
                this._showProblems = true;
                this._setDisplay(box.value);
            } else {
                this._setDisplay(
                    this.display.slice(0, at) + token + this.display.slice(end)
                );
            }
        }
        if (picker) {
            picker.value = null;
        }
    }

    async handleCheck() {
        this.checking = true;
        this.checked = null;
        this.checkFailed = false;
        const checkedText = this._stored;
        try {
            const found = await checkConditions({
                specJson: JSON.stringify(this.spec || {}),
                actionId: this.actionId,
                soql: checkedText
            });
            // Edited while it ran: that answer is about other text.
            if (checkedText === this._stored) {
                this.checked = found || [];
            }
        } catch {
            this.checkFailed = true;
        } finally {
            this.checking = false;
        }
    }
}
