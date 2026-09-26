import { LightningElement, api } from 'lwc';
import USER_ID from '@salesforce/user/Id';
import fitsTable from '@salesforce/apex/FinalAutofillController.fitsTable';
import getTestRecordValues from '@salesforce/apex/FinalAutofillController.getTestRecordValues';
import describeReferenceTargets from '@salesforce/apex/FinalAutofillController.describeReferenceTargets';
import listLookupObjects from '@salesforce/apex/FinalLookupController.listLookupObjects';
import { typeForPath } from 'c/finalFieldPicker';
import { answerTypeOf, fitValue, DOES_NOT_FIT } from 'c/finalAutofillFit';

function mintId(prefix) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let suffix = '';
    for (const b of bytes) {
        suffix += (b % 36).toString(36);
    }
    return `${prefix}_${suffix}`;
}

const ANSWER_WORDS = {
    Text: 'text',
    Email: 'email',
    Phone: 'phone',
    URL: 'link',
    Number: 'number',
    Date: 'date',
    Choice: 'choice'
};

/**
 * finalAutofillRuleEditor — one Autofill rule, edited in the Studio's large
 * dialog (IMPL_PLAN_F2_AUTOFILL 6.2). Where the values come from (the record
 * in the link, or a record picked in a lookup question), which Salesforce
 * field fills which question, whether guests may receive each value, and
 * what happens to an answer someone already typed.
 *
 * It edits its own copy and emits `rulechange` { rule } on every edit; the
 * dialog's Apply asks `problems` / `reportProblems()` before saving. The
 * fits table comes from the server (FinalAutofillRules), so what the browser
 * offers is exactly what publish accepts. am- classes.
 */
export default class FinalAutofillRuleEditor extends LightningElement {
    @api spec;
    @api formId;
    @api isPublic = false;
    /** Another enabled link rule exists: a link carries one record (D67). */
    @api hasOtherLinkRule = false;
    /** 'form' | 'survey' | 'freeform' (IMPL_PLAN_F2_AUTOFILL 8). */
    @api formType;

    draft = null;
    fits = {};
    objects = [];
    fromTypes = {};
    referenceTargets = [];
    showProblems = false;

    testRecordId = '';
    testBusy = false;
    testError = '';
    testValues = null;

    @api
    get rule() {
        return this.draft;
    }
    set rule(value) {
        const next = value
            ? JSON.parse(JSON.stringify(value))
            : {
                  id: mintId('af'),
                  name: '',
                  enabled: true,
                  policy: 'preserveEdits',
                  source: { type: this.hasOtherLinkRule ? 'lookup' : 'link' },
                  mappings: []
              };
        next.mappings = next.mappings || [];
        next.source = next.source || { type: 'link' };
        next.policy = next.policy || 'preserveEdits';
        if (!next.mappings.length) {
            next.mappings.push(this._newRow());
        }
        this.draft = next;
        this._typeRows();
    }

    connectedCallback() {
        // A survey's link reads its connected object, whatever an older rule
        // saved. Silent: correcting it isn't an edit the author made.
        if (
            this.isLink &&
            this.lockedLinkObject &&
            this.draft.source.objectApiName !== this.lockedLinkObject
        ) {
            this.draft = {
                ...this.draft,
                source: {
                    ...this.draft.source,
                    objectApiName: this.lockedLinkObject
                }
            };
        }
        // A new rule on a form that already has a link rule starts on a
        // lookup (the page may have set `rule` before `has-other-link-rule`).
        if (
            this.linkConflict &&
            this.isLink &&
            !this.draft.source.objectApiName &&
            !this.draft.mappings.some((m) => m.from)
        ) {
            this.draft = {
                ...this.draft,
                source: {
                    type: 'lookup',
                    elementId: this.lookupElements[0]?.id || ''
                }
            };
        }
        fitsTable()
            .then((table) => {
                this.fits = table || {};
            })
            .catch(() => {
                this.fits = {};
            });
        listLookupObjects()
            .then((rows) => {
                this.objects = rows || [];
            })
            .catch(() => {
                this.objects = [];
            });
        if (this.isPolymorphicLookup) {
            this._loadReferenceTargets();
        }
    }

    _newRow() {
        return { id: mintId('afm'), from: '', to: '', guestAllowed: false };
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('rulechange', {
                detail: { rule: JSON.parse(JSON.stringify(this.draft)) }
            })
        );
    }

    _update(fn) {
        const next = JSON.parse(JSON.stringify(this.draft));
        fn(next);
        this.draft = next;
        this._emit();
    }

    // ---- the form: where answers go, and which lookups there are ----

    get _elements() {
        const out = [];
        (this.spec?.pages || []).forEach((page) =>
            (page.sections || []).forEach((sec) =>
                (sec.elements || []).forEach((el) =>
                    out.push({ el, inRepeater: Boolean(sec.repeat) })
                )
            )
        );
        return out;
    }

    /** Every question (or field) Autofill can fill: { id, label, answerType }. */
    get destinations() {
        return this._elements
            .filter(({ el, inRepeater }) => !inRepeater && !el.readOnly)
            .map(({ el }) => ({
                id: el.id,
                label: el.label || el.id,
                answerType: answerTypeOf(el),
                options: (el.config && el.config.options) || null
            }))
            .filter((d) => d.answerType);
    }

    get lookupElements() {
        return this._elements
            .filter(
                ({ el, inRepeater }) =>
                    !inRepeater &&
                    el.type === 'field' &&
                    (el.config?.inputType === 'reference' ||
                        Boolean(el.binding?.referenceTo))
            )
            .map(({ el }) => ({
                id: el.id,
                label: el.label || el.id,
                object:
                    el.binding?.referenceTo ||
                    el.config?.referenceTo ||
                    el.lookupConfig?.targetObject ||
                    '',
                polymorphic: Boolean(el.config?.polymorphic),
                binding: el.binding || null
            }));
    }

    // ---- the form type ----

    get isForm() {
        return this.formType === 'form';
    }

    get isSurvey() {
        return this.formType === 'survey';
    }

    /** A Form fills fields; Surveys and Freeform fill questions. */
    get answerNoun() {
        return this.isForm ? 'field' : 'question';
    }

    get choosePlaceholder() {
        return `Choose a ${this.answerNoun}`;
    }

    get lookupLabel() {
        return `Lookup ${this.answerNoun}`;
    }

    get noLookupsHint() {
        return this.isForm
            ? 'Add a lookup field to the form first.'
            : 'Add a Record lookup question to the form first.';
    }

    /** A survey's link always carries its connected record ('' if none). */
    get lockedLinkObject() {
        if (!this.isSurvey) {
            return null;
        }
        return (
            this.spec?.form?.primaryContextObject ||
            this.spec?.form?.targetObject ||
            ''
        );
    }

    get isLinkLocked() {
        return this.lockedLinkObject !== null;
    }

    get lockedLinkText() {
        return `Object in the link: ${this.lockedLinkObject}, the object this survey is connected to.`;
    }

    get surveyNotConnected() {
        return this.isSurvey && !this.lockedLinkObject;
    }

    // ---- the source ----

    get isLink() {
        return this.draft?.source?.type === 'link';
    }

    get isLookup() {
        return this.draft?.source?.type === 'lookup';
    }

    /** The signed-in person's own User record (7.2). */
    get isUser() {
        return this.draft?.source?.type === 'user';
    }

    get userClass() {
        return this.isUser ? 'am-seg on' : 'am-seg';
    }

    get userPressed() {
        return String(this.isUser);
    }

    get linkClass() {
        return this.isLink ? 'am-seg on' : 'am-seg';
    }

    get lookupClass() {
        return this.isLookup ? 'am-seg on' : 'am-seg';
    }

    get linkPressed() {
        return String(this.isLink);
    }

    get lookupPressed() {
        return String(this.isLookup);
    }

    /** Another link rule is on, and this one would be on too. */
    get linkConflict() {
        return Boolean(this.hasOtherLinkRule && this.draft?.enabled);
    }

    get linkDisabled() {
        return this.linkConflict && !this.isLink;
    }

    get lookupOptions() {
        return this.lookupElements.map((l) => ({
            label: l.polymorphic
                ? `${l.label} (several objects)`
                : l.object
                  ? `${l.label} (${l.object})`
                  : `${l.label} (no object yet)`,
            value: l.id
        }));
    }

    get hasLookups() {
        return this.lookupElements.length > 0;
    }

    get selectedLookup() {
        return (
            this.lookupElements.find(
                (l) => l.id === this.draft?.source?.elementId
            ) || null
        );
    }

    get isPolymorphicLookup() {
        return Boolean(this.isLookup && this.selectedLookup?.polymorphic);
    }

    get polymorphicOptions() {
        return this.referenceTargets.map((t) => ({
            label: t.label,
            value: t.value
        }));
    }

    /** The object this rule reads, or '' until it's known. */
    get sourceObject() {
        if (this.isUser) {
            return 'User';
        }
        if (this.isLink) {
            if (this.isLinkLocked) {
                return this.lockedLinkObject;
            }
            return this.draft.source.objectApiName || '';
        }
        const lookup = this.selectedLookup;
        if (!lookup) {
            return '';
        }
        return lookup.polymorphic
            ? this.draft.source.objectApiName || ''
            : lookup.object;
    }

    get hasSourceObject() {
        return Boolean(this.sourceObject);
    }

    handleLink() {
        if (this.isLink || this.linkDisabled) return;
        this._update((r) => {
            r.source = {
                type: 'link',
                objectApiName: this.lockedLinkObject || ''
            };
            this._clearRows(r);
        });
        this._afterSourceChange();
    }

    /**
     * A different object means different fields: a row keeps its question
     * but its field, and any "show to guests" tick, start over — a tick given
     * for Contact.Email must never carry over to another object's Email.
     */
    _clearRows(r) {
        r.mappings.forEach((m) => {
            m.from = '';
            m.guestAllowed = false;
        });
    }

    handleUser() {
        if (this.isUser) return;
        this._update((r) => {
            r.source = { type: 'user' };
            // the signed-in person's values never go to guests
            this._clearRows(r);
        });
        this._afterSourceChange();
    }

    handleLookup() {
        if (this.isLookup) return;
        this._update((r) => {
            r.source = {
                type: 'lookup',
                elementId: this.lookupElements[0]?.id || ''
            };
            this._clearRows(r);
            // a lookup is signed-in only: nothing goes to guests
            r.mappings.forEach((m) => {
                m.guestAllowed = false;
            });
        });
        this._afterSourceChange();
    }

    handleObjectPick(event) {
        const value = event.detail.value;
        if (value === this.draft.source.objectApiName) return;
        this._update((r) => {
            r.source.objectApiName = value;
            this._clearRows(r);
        });
        this._afterSourceChange();
    }

    handleLookupPick(event) {
        const value = event.detail.value;
        this._update((r) => {
            r.source = { type: 'lookup', elementId: value };
            this._clearRows(r);
        });
        this._afterSourceChange();
    }

    handlePolymorphicPick(event) {
        const value = event.detail.value;
        const target = this.referenceTargets.find((t) => t.value === value);
        this._update((r) => {
            r.source.objectApiName = value;
            this._clearRows(r);
            // the runtime reads the rule only when the picked record is this
            if (target && target.keyPrefix) {
                r.source.keyPrefix = target.keyPrefix;
            } else {
                delete r.source.keyPrefix;
            }
        });
        this._typeRows();
    }

    _afterSourceChange() {
        this.fromTypes = {};
        this.testValues = null;
        if (this.isPolymorphicLookup) {
            this._loadReferenceTargets();
        }
        this._typeRows();
    }

    async _loadReferenceTargets() {
        const binding = this.selectedLookup?.binding;
        if (!binding?.object || !binding?.field) {
            this.referenceTargets = [];
            return;
        }
        try {
            this.referenceTargets =
                (await describeReferenceTargets({
                    objectApiName: binding.object,
                    fieldApiName: binding.field
                })) || [];
        } catch {
            this.referenceTargets = [];
        }
    }

    // ---- the rows ----

    /** Each row's source field type, for what it fits. */
    async _typeRows() {
        const object = this.sourceObject;
        if (!object || !this.draft) {
            return;
        }
        const types = { ...this.fromTypes };
        await Promise.all(
            this.draft.mappings
                .filter((m) => m.from && !types[m.from])
                .map(async (m) => {
                    types[m.from] = await typeForPath(object, m.from, 'read');
                })
        );
        if (object === this.sourceObject) {
            this.fromTypes = types;
        }
    }

    /** The object's own fields, and one hop to a related record (7.1). */
    get maxDepth() {
        return 1;
    }

    /** The signed-in person reaches their Contact, Account or Manager only. */
    get allowedRelationships() {
        return this.isUser ? ['Contact', 'Account', 'Manager'] : [];
    }

    /** Every describe type that fits at least one question on this form. */
    get allowedTypes() {
        const answerTypes = new Set(this.destinations.map((d) => d.answerType));
        return Object.keys(this.fits).filter((t) =>
            (this.fits[t] || []).some((a) => answerTypes.has(a))
        );
    }

    get rows() {
        const byId = new Map(this.destinations.map((d) => [d.id, d]));
        return (this.draft?.mappings || []).map((m, index) => {
            const typed =
                m.from &&
                Object.prototype.hasOwnProperty.call(this.fromTypes, m.from);
            const type = m.from ? this.fromTypes[m.from] : null;
            const fitting = type ? this.fits[type] || [] : null;
            const options = this.destinations
                .filter((d) => !fitting || fitting.includes(d.answerType))
                .map((d) => ({
                    label: `${d.label} (${ANSWER_WORDS[d.answerType]})`,
                    value: d.id
                }));
            const current = m.to ? byId.get(m.to) : null;
            let problem = '';
            if (!m.from) {
                problem = 'Choose a Salesforce field.';
            } else if (typed && !type) {
                problem = `That field isn’t on ${this.sourceObject}.`;
            } else if (!m.to) {
                problem = 'Choose what it fills.';
            } else if (!current) {
                problem = `That ${this.answerNoun} is no longer on the form.`;
            } else if (fitting && !fitting.includes(current.answerType)) {
                problem = `This field can’t fill a ${ANSWER_WORDS[current.answerType]} answer.`;
            }
            if (m.to && !options.some((o) => o.value === m.to)) {
                // keep a saved choice visible, so its problem makes sense
                options.push({
                    label: current
                        ? `${current.label} (doesn’t fit)`
                        : `${m.to} (removed)`,
                    value: m.to
                });
            }
            const test =
                this.testValues &&
                m.from &&
                Object.prototype.hasOwnProperty.call(this.testValues, m.from)
                    ? this.testValues[m.from]
                    : undefined;
            let testText = '';
            if (test !== undefined) {
                const filled = fitValue(test, current || undefined);
                if (test === null || test === '') {
                    testText = 'Empty on this record';
                } else if (filled === DOES_NOT_FIT) {
                    testText =
                        current && current.answerType === 'Choice'
                            ? `Won’t fill: “${test}” isn’t one of this question’s options`
                            : `Won’t fill: “${test}” doesn’t fit a ${ANSWER_WORDS[current.answerType]} answer`;
                } else {
                    testText = `Fills: ${filled}`;
                }
            }
            return {
                key: m.id || `row${index}`,
                index,
                from: m.from,
                to: m.to,
                guestAllowed: Boolean(m.guestAllowed),
                options,
                problem: this.showProblems ? problem : '',
                rawProblem: problem,
                hasTest: test !== undefined,
                testText,
                removeLabel: `Remove row ${index + 1}`,
                fieldLabel: `Salesforce field, row ${index + 1}`,
                toLabel: `Fills, row ${index + 1}`,
                guestLabel: `Show to people who aren’t signed in, row ${index + 1}`
            };
        });
    }

    handleFromPick(event) {
        const index = Number(event.currentTarget.dataset.index);
        const { value, type } = event.detail;
        if (type) {
            this.fromTypes = { ...this.fromTypes, [value]: type };
        }
        this._update((r) => {
            r.mappings[index].from = value;
        });
        this._typeRows();
    }

    handleToPick(event) {
        const index = Number(event.currentTarget.dataset.index);
        const value = event.detail.value;
        this._update((r) => {
            r.mappings[index].to = value;
        });
    }

    handleGuest(event) {
        const index = Number(event.currentTarget.dataset.index);
        const checked = event.target.checked;
        this._update((r) => {
            r.mappings[index].guestAllowed = checked;
        });
    }

    handleAddRow() {
        this._update((r) => {
            r.mappings.push(this._newRow());
        });
    }

    handleRemoveRow(event) {
        const index = Number(event.currentTarget.dataset.index);
        this._update((r) => {
            r.mappings.splice(index, 1);
        });
    }

    // ---- the rest ----

    handleName(event) {
        const value = event.target.value;
        this._update((r) => {
            r.name = value;
        });
    }

    handleEnabled(event) {
        const checked = event.target.checked;
        this._update((r) => {
            r.enabled = checked;
        });
    }

    get policyOptions() {
        return [
            { label: 'Keep what they typed', value: 'preserveEdits' },
            { label: 'Always replace it', value: 'alwaysReplace' }
        ];
    }

    handlePolicy(event) {
        const value = event.detail.value;
        this._update((r) => {
            r.policy = value;
        });
    }

    get showGuestColumn() {
        return this.isLink;
    }

    get guestNote() {
        if (!this.isLink) {
            return '';
        }
        return this.isPublic
            ? 'This form is public. People who aren’t signed in get only the fields you tick.'
            : 'Tick a field to fill it for people who aren’t signed in.';
    }

    // ---- try it ----

    handleTestId(event) {
        this.testRecordId = (event.target.value || '').trim();
        this.testError = '';
    }

    get testDisabled() {
        return (
            this.testBusy ||
            (!this.isUser && ![15, 18].includes(this.testRecordId.length)) ||
            !this.hasSourceObject ||
            !(this.draft?.mappings || []).some((m) => m.from)
        );
    }

    async handleTest() {
        if (this.testDisabled) return;
        this.testBusy = true;
        this.testError = '';
        try {
            this.testValues =
                (await getTestRecordValues({
                    formId: this.formId || null,
                    objectApiName: this.sourceObject,
                    // the signed-in person: try it on yourself
                    recordId: this.isUser ? USER_ID : this.testRecordId,
                    fieldApiNames: this.draft.mappings
                        .map((m) => m.from)
                        .filter(Boolean)
                })) || {};
        } catch (e) {
            this.testValues = null;
            this.testError =
                e?.body?.message || 'That record couldn’t be read.';
        } finally {
            this.testBusy = false;
        }
    }

    // ---- Apply ----

    /** What stops Apply: [{ message }]. */
    @api
    get problems() {
        const out = [];
        if (!this.draft) {
            return out;
        }
        if (this.isLink && this.linkConflict) {
            out.push({
                message:
                    'Turn off the other link rule first, or turn this one off. A link carries one record.'
            });
        }
        if (this.isLink && this.surveyNotConnected) {
            out.push({
                message: 'Connect this survey to an object first.'
            });
        } else if (this.isLink && !this.sourceObject) {
            out.push({ message: 'Choose the object in the link.' });
        }
        if (this.isLookup && !this.selectedLookup) {
            out.push({ message: `Choose the lookup ${this.answerNoun}.` });
        } else if (this.isLookup && !this.sourceObject) {
            out.push({
                message: this.isPolymorphicLookup
                    ? 'Choose which object this rule reads.'
                    : 'That lookup question has no object yet. Pick one in its settings.'
            });
        }
        const rows = this.rows.filter((r) => r.rawProblem);
        if (rows.length) {
            out.push({
                message:
                    rows.length === 1
                        ? '1 row needs attention.'
                        : `${rows.length} rows need attention.`
            });
        }
        return out;
    }

    @api
    reportProblems() {
        this.showProblems = true;
        return this.problems;
    }

    get shownProblems() {
        return this.showProblems
            ? this.problems.map((p, i) => ({ key: `p${i}`, text: p.message }))
            : [];
    }

    get hasShownProblems() {
        return this.shownProblems.length > 0;
    }
}
