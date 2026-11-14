import { LightningElement, api } from 'lwc';

/**
 * Delete for one existing row of a related list on a record page
 * (IMPL_PLAN_RELATED_RECORDS Part 2, slice 3; mock related-lists-mock.html).
 *
 * Three states, all in the row itself (no modal: `lightning/confirm` hangs in
 * the VF Studio, and the row must stay in view):
 *   1. a bin button, "Delete Case 00001026";
 *   2. the warning, "Delete this Case? This can't be undone after you save."
 *      with Delete and Cancel;
 *   3. once confirmed, "Will be deleted when you save" with Undo.
 * Nothing is deleted here: the form's one Save does it. The parent owns
 * which rows are marked (`marked`); this asks for a change with
 * `rowdelete` { key, deleted }.
 *
 * rd- prefixed classes (LEX leak rule).
 */
export default class FinalRowDelete extends LightningElement {
    /** The row's record name ("00001026") and its object's label ("Case"). */
    @api name;
    @api noun = 'record';
    /** The row's entry key (its record id). */
    @api rowKey;
    /** Marked for delete at Save. */
    @api marked = false;

    confirming = false;
    /** Where the cursor goes once the next state has drawn. */
    _focusNext = null;

    get showAsk() {
        return !this.marked && this.confirming;
    }

    get showBin() {
        return !this.marked && !this.confirming;
    }

    get binLabel() {
        return `Delete ${this.noun} ${this.name || ''}`.trim();
    }

    // built here: a template drops a text's leading space
    get askText() {
        return `Delete this ${this.noun}? This can’t be undone after you save.`;
    }

    get undoLabel() {
        return `Undo delete of ${this.noun} ${this.name || ''}`.trim();
    }

    renderedCallback() {
        if (!this._focusNext) {
            return;
        }
        const target = this.template.querySelector(this._focusNext);
        if (target) {
            this._focusNext = null;
            target.focus();
        }
    }

    handleBin() {
        this.confirming = true;
        // the safe answer first
        this._focusNext = '.rd-no';
    }

    handleCancel() {
        this.confirming = false;
        this._focusNext = '.rd-bin';
    }

    handleAskKeydown(event) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            this.handleCancel();
        }
    }

    handleDelete() {
        this.confirming = false;
        this._focusNext = '.rd-undo';
        this._emit(true);
    }

    handleUndo() {
        this._focusNext = '.rd-bin';
        this._emit(false);
    }

    _emit(deleted) {
        this.dispatchEvent(
            new CustomEvent('rowdelete', {
                detail: { key: this.rowKey, deleted }
            })
        );
    }
}
