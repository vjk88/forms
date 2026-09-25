import { api } from 'lwc';
import LightningModal from 'lightning/modal';

/**
 * The conditions dialog (IMPL_PLAN_F2_SEARCH decision 1, D53) — the Form
 * Designer's "Set Visibility" dialog, for every screen that edits
 * conditions in a cramped panel: visibility rules and lookup filters. (The
 * mapping step has room, so it edits its conditions on the page.)
 *
 * It edits a DRAFT. Nothing reaches the form until Apply conditions, and
 * Cancel returns nothing, so a half-finished edit can never be published.
 *
 * Apply with problems doesn't close: every problem is shown under its
 * control, the first is focused, and the footer counts what's left.
 *
 * Closing resolves `{ value }` on Apply (value may be null: no conditions)
 * and `undefined` on Cancel. cm- prefixed classes (LEX leak rule).
 */
export default class FinalConditionsModal extends LightningModal {
    /** Header, e.g. "Visibility — Email". */
    @api label;
    /** One sentence under it saying what the conditions decide. */
    @api description;

    // Passed straight to c-final-rule-editor.
    @api columns = 'visibility';
    @api sources = [];
    @api recordSources = [];
    @api sourceIndex;
    @api hostRepeatSectionId;
    @api noun = 'field';
    @api extraOperators;
    @api fieldObject;
    @api isPublic = false;
    @api allowCurrentUser = false;
    @api answerChoices = [];
    @api recordObject;

    draft = null;
    /** Set after an Apply that found problems; tracks what's left. */
    attentionRows = 0;
    attentionLogic = false;
    _attending = false;

    /**
     * Opened from "Add conditions": start with one empty row, so the first
     * click isn't spent on Add condition. A row nobody uses is dropped on
     * Apply rather than refused.
     */
    @api startWithRow = false;

    @api
    get value() {
        return this.draft;
    }
    set value(v) {
        this.draft = v ? JSON.parse(JSON.stringify(v)) : null;
    }

    connectedCallback() {
        if (
            this.startWithRow &&
            !(this.draft && this.draft.rules && this.draft.rules.length)
        ) {
            this.draft = {
                action: 'show',
                logic: 'all',
                customLogic: null,
                rules: [{ source: '', operator: 'equals', value: '' }]
            };
        }
    }

    get hasConditions() {
        return Boolean(
            this.draft && this.draft.rules && this.draft.rules.length
        );
    }

    get clearDisabled() {
        return !this.hasConditions;
    }

    get editor() {
        return this.template.querySelector('c-final-rule-editor');
    }

    /** Counts conditions, not problems: one row missing two things is one. */
    get attentionText() {
        const n = this.attentionRows;
        const rows = n === 1 ? '1 condition' : n > 1 ? `${n} conditions` : '';
        if (rows && this.attentionLogic) {
            return `${rows} and the custom logic need attention`;
        }
        if (this.attentionLogic) {
            return 'The custom logic needs attention';
        }
        return n === 1 ? `${rows} needs attention` : `${rows} need attention`;
    }

    get showAttention() {
        return (
            this._attending && (this.attentionRows > 0 || this.attentionLogic)
        );
    }

    _count(problems) {
        const rows = new Set(
            problems.filter((p) => p.rowIndex !== null).map((p) => p.rowIndex)
        ).size;
        const logic = problems.some((p) => p.control === 'logic');
        if (rows !== this.attentionRows) {
            this.attentionRows = rows;
        }
        if (logic !== this.attentionLogic) {
            this.attentionLogic = logic;
        }
    }

    renderedCallback() {
        if (this._attending && this.editor) {
            this._count(this.editor.problems);
        }
    }

    handleDraft(event) {
        event.stopPropagation();
        this.draft = event.detail.value;
    }

    handleClear() {
        this.draft = null;
        this._attending = false;
        if (this.editor) {
            this.editor.reset();
        }
    }

    handleCancel() {
        this.close(undefined);
    }

    /** Rows added and never used don't block Apply; they just go. */
    _dropUntouchedBlankRows() {
        const editor = this.editor;
        const drop = editor ? editor.untouchedBlankRows() : [];
        if (!drop.length || !this.draft) {
            return false;
        }
        const rules = this.draft.rules.filter((_, i) => !drop.includes(i));
        this.draft = rules.length ? { ...this.draft, rules } : null;
        return true;
    }

    async handleApply() {
        if (this._dropUntouchedBlankRows()) {
            // Let the editor take the shorter list before asking what's wrong.
            await Promise.resolve();
        }
        if (!this.draft) {
            this.close({ value: null });
            return;
        }
        const editor = this.editor;
        const problems = editor ? editor.problems : [];
        if (problems.length) {
            this._attending = true;
            this._count(problems);
            editor.focusProblem(editor.reportProblems());
            return;
        }
        this.close({ value: this.draft });
    }

    handleGoToFirst() {
        const editor = this.editor;
        if (editor) {
            editor.focusProblem(editor.reportProblems());
        }
    }
}
