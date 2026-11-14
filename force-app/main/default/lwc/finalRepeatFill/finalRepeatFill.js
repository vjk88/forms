import { LightningElement, api } from 'lwc';
import FinalRepeatFillModal from 'c/finalRepeatFillModal';
import { isFillable, valueText } from 'c/finalRepeatGroups';

/**
 * "Fill on new records" in a repeating group's inspector
 * (IMPL_PLAN_RELATED_RECORDS P2.6; owner pick "B, list + dialog",
 * mocks/quiet-fill-mock.html): one line per fill, "+ Add a field to fill",
 * and a small dialog to set or change one. Every new related record gets
 * these values when the form is saved; the person filling it in never sees
 * them.
 *
 * Fires `fillchange` { fills } with the whole list (empty when none).
 * rf- prefixed classes (LEX leak rule).
 */
export default class FinalRepeatFill extends LightningElement {
    /** repeat.fill: [{ field, value } | { field, from, fromLabel }] */
    @api fills = [];
    /** The group's child object (Case) and the form's object (Contact). */
    @api childObject;
    @api parentObject;
    /** describeFields rows for the child object. */
    @api childFields = [];
    /** Child fields that can't be filled: the group's questions and the
     *  link field. */
    @api takenFields = [];
    /** The child object's fields are still loading. */
    @api loading = false;

    /** Where the cursor goes once the list draws again: a line, or Add. */
    _focusNext = null;

    renderedCallback() {
        if (this._focusNext === null) {
            return;
        }
        const want = this._focusNext;
        const rows = this.template.querySelectorAll('.rf-line');
        if (want !== 'add' && rows.length < (this.fills || []).length) {
            return; // the new list hasn't drawn yet
        }
        this._focusNext = null;
        const add = this.template.querySelector('.rf-add');
        const target =
            want === 'add' || !rows.length
                ? add && !add.disabled
                    ? add
                    : null
                : rows[Math.min(want, rows.length - 1)];
        if (target) {
            target.focus();
        }
    }

    get _byApi() {
        return new Map((this.childFields || []).map((f) => [f.apiName, f]));
    }

    get lines() {
        const byApi = this._byApi;
        return (this.fills || []).map((f, i) => {
            const field = byApi.get(f.field);
            const label = field ? field.label : f.field;
            const fromParent = Boolean(f.from);
            const value = fromParent
                ? `${this.parentObject}’s ${f.fromLabel || f.from}`
                : valueText(field, f.value);
            return {
                key: `${f.field}:${i}`,
                index: i,
                label,
                // built here: a template drops a text's leading space
                rest: value ? ` = ${value}` : '',
                how: fromParent
                    ? `From the ${this.parentObject}`
                    : 'Fixed value',
                editText: `Change how ${label} is filled`,
                removeText: `Remove ${label}`
            };
        });
    }

    get hasLines() {
        return (this.fills || []).length > 0;
    }

    get helpText() {
        return `Set on every new ${this.childObject} when the form is saved. People filling in the form don't see them.`;
    }

    get showList() {
        return !this.loading && this.hasLines;
    }

    get loadingText() {
        return `Loading ${this.childObject} fields…`;
    }

    /** Add is off: say why, so it isn't a mystery. */
    get noChoicesText() {
        return this.loading || !this.noChoices
            ? ''
            : `Every ${this.childObject} field that can be filled is already used.`;
    }

    get addDisabled() {
        return this.loading || this.noChoices;
    }

    /** The fields the dialog may offer, leaving out the one being edited. */
    _choices(editing) {
        const taken = new Set(this.takenFields || []);
        (this.fills || []).forEach((f) => {
            if (f.field !== editing) {
                taken.add(f.field);
            }
        });
        return (this.childFields || [])
            .filter((f) => isFillable(f) && !taken.has(f.apiName))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    get noChoices() {
        return this._choices(null).length === 0;
    }

    handleAdd() {
        this._open(-1);
    }

    handleEdit(event) {
        this._open(Number(event.currentTarget.dataset.index));
    }

    handleRemove(event) {
        const i = Number(event.currentTarget.dataset.index);
        const next = (this.fills || []).filter((_, k) => k !== i);
        // the cursor stays in the list: the next line, or the Add button
        this._focusNext = next.length ? Math.min(i, next.length - 1) : 'add';
        this._emit(next);
    }

    async _open(index) {
        const current = index >= 0 ? this.fills[index] : null;
        const result = await FinalRepeatFillModal.open({
            size: 'small',
            label: current
                ? `Change how ${this._labelOf(current.field)} is filled`
                : 'Fill a field on new records',
            description: `Every new ${this.childObject} gets this value when the form is saved.`,
            childObject: this.childObject,
            parentObject: this.parentObject,
            fields: this._choices(current ? current.field : null),
            fill: current
        });
        if (!result) {
            return; // Cancel
        }
        const next = [...(this.fills || [])];
        if (index >= 0) {
            next[index] = result;
        } else {
            next.push(result);
        }
        // back on the line just set, not on an Add that may now be off
        this._focusNext = index >= 0 ? index : next.length - 1;
        this._emit(next);
    }

    _labelOf(apiName) {
        const f = this._byApi.get(apiName);
        return f ? f.label : apiName;
    }

    _emit(fills) {
        this.dispatchEvent(
            new CustomEvent('fillchange', { detail: { fills } })
        );
    }
}
