import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import LightningConfirm from 'lightning/confirm';

/**
 * The conditions dialog (IMPL_PLAN_F2_SEARCH decision 1, D53) — the Form
 * Designer's "Set Visibility" dialog, for every screen that edits
 * conditions: visibility rules, lookup filters, the mapping search.
 *
 * It edits a DRAFT. Nothing reaches the form until Apply conditions, and
 * Cancel returns nothing, so a half-finished edit can never be published.
 *
 * Apply with problems doesn't close: every problem is shown under its
 * control, the first is focused, and the footer counts what's left.
 *
 * The mapping search also has an Advanced (SOQL) tab (D50). Each tab keeps
 * its own draft; switching never asks and never discards. Apply uses the
 * open tab and, if the other one has content, asks once before dropping it.
 *
 * Closing resolves `{ value, typed }` on Apply (value may be null: no
 * conditions; typed = { mode: 'soql' | 'rows', soql } when typing is
 * allowed) and `undefined` on Cancel. cm- prefixed classes (LEX leak rule).
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
    /** Mapping screen: the questions a row may compare with (Task 7). */
    @api answerChoices = [];
    @api recordObject;

    /** Mapping search: offer the Advanced (SOQL) tab. */
    @api allowTyped = false;
    /** The saved typed conditions: { mode, soql }. */
    @api typedValue;
    /** What the typed box needs: { spec, actionId, questions }. */
    @api typedContext;

    draft = null;
    soqlDraft = '';
    activeTab = 'conditions';
    typedAttention = '';
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
        const typed = this.typedValue || {};
        this.soqlDraft = typed.soql || '';
        if (this.allowTyped && typed.mode === 'soql') {
            this.activeTab = 'soql';
        }
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
        return this.onTyped ? !this.soqlDraft.trim() : !this.hasConditions;
    }

    get onTyped() {
        return this.allowTyped && this.activeTab === 'soql';
    }

    get typedQuestions() {
        return (this.typedContext && this.typedContext.questions) || [];
    }

    get typedSpec() {
        return this.typedContext && this.typedContext.spec;
    }

    get typedActionId() {
        return this.typedContext && this.typedContext.actionId;
    }

    /** Built conditions that say something (a blank row isn't one). */
    get builtCount() {
        return ((this.draft && this.draft.rules) || []).filter((r) => r.source)
            .length;
    }

    _conditionsWord(n) {
        return n === 1 ? 'the 1 condition' : `the ${n} conditions`;
    }

    /** On the typed tab, when there are built conditions it would replace. */
    get replaceBuiltNotice() {
        const n = this.builtCount;
        return n
            ? `Applying uses Advanced (SOQL). ${this._conditionsWord(n).replace(/^the/, 'The')} you built will be removed.`
            : '';
    }

    /** On the Conditions tab, when there is typed text it would replace. */
    get replaceTypedNotice() {
        return this.soqlDraft.trim()
            ? 'Applying uses the built conditions. The Advanced (SOQL) text will be removed.'
            : '';
    }

    handleTab(event) {
        this.activeTab = event.target.value;
        this._attending = false;
        this.typedAttention = '';
    }

    handleSoql(event) {
        event.stopPropagation();
        this.soqlDraft = event.detail.value || '';
        this.typedAttention = '';
    }

    get editor() {
        return this.template.querySelector('c-final-rule-editor');
    }

    /** Counts conditions, not problems: one row missing two things is one. */
    get attentionText() {
        if (this.onTyped) {
            return this.typedAttention;
        }
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

    /** One box on the typed tab: focus already lands on it. */
    get showGoToFirst() {
        return !this.onTyped;
    }

    get showAttention() {
        if (this.onTyped) {
            return Boolean(this.typedAttention);
        }
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
        if (this.onTyped) {
            this.soqlDraft = '';
            const box = this.template.querySelector('c-final-mapping-soql');
            if (box) {
                box.value = '';
            }
            return;
        }
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

    /** Asks once before Apply drops the other tab's content. */
    async _confirmReplace(message) {
        return LightningConfirm.open({
            message,
            label: 'Replace conditions?',
            theme: 'warning'
        });
    }

    async _applyTyped() {
        const box = this.template.querySelector('c-final-mapping-soql');
        if (!this.soqlDraft.trim()) {
            this.typedAttention =
                'Write the conditions, or go back to the Conditions tab.';
            if (box) box.focus();
            return;
        }
        if (box && !box.reportValidity()) {
            this.typedAttention = 'The conditions need attention';
            box.focus();
            return;
        }
        const n = this.builtCount;
        if (
            n &&
            !(await this._confirmReplace(
                `Replace ${this._conditionsWord(n)} you built with the Advanced (SOQL) conditions?`
            ))
        ) {
            return; // both drafts kept, dialog stays open
        }
        this.close({
            value: null,
            typed: { mode: 'soql', soql: this.soqlDraft }
        });
    }

    async _closeBuilt(value) {
        if (!this.allowTyped) {
            this.close({ value });
            return;
        }
        if (
            this.soqlDraft.trim() &&
            !(await this._confirmReplace(
                'Replace the Advanced (SOQL) conditions with the built conditions?'
            ))
        ) {
            return;
        }
        this.close({ value, typed: { mode: 'rows', soql: '' } });
    }

    async handleApply() {
        if (this.onTyped) {
            await this._applyTyped();
            return;
        }
        if (this._dropUntouchedBlankRows()) {
            // Let the editor take the shorter list before asking what's wrong.
            await Promise.resolve();
        }
        if (!this.draft) {
            await this._closeBuilt(null);
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
        await this._closeBuilt(this.draft);
    }

    handleGoToFirst() {
        if (this.onTyped) {
            const box = this.template.querySelector('c-final-mapping-soql');
            if (box) box.focus();
            return;
        }
        const editor = this.editor;
        if (editor) {
            editor.focusProblem(editor.reportProblems());
        }
    }
}
