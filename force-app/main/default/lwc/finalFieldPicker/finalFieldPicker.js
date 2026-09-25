import { LightningElement, api } from 'lwc';
import describeLookupFields from '@salesforce/apex/FinalLookupController.describeLookupFields';
import describeReadableFields from '@salesforce/apex/FinalLookupController.describeReadableFields';

/**
 * finalFieldPicker — choose a field of an object, or of a record it looks
 * up to, by typing (IMPL_PLAN_F2_SEARCH decision 20, D54). Related fields
 * are one level deep, listed the Form Designer's way — "Account › Industry"
 * — and loaded only when the author opens that relationship. Every
 * relationship is listed; none is capped away.
 *
 * Purpose: 'filter' (the default — conditions compile to a WHERE clause,
 * so only filterable fields) or 'read' (Autofill reads fields, long text
 * included). `max-depth` 0 hides related fields; `allowed-types` and
 * `allowed-relationships` narrow what is offered (IMPL_PLAN_F2_AUTOFILL 6.3).
 *
 * Emits `fieldchange` { value, label, type } where value is `prefix + path`
 * (`Industry`, `Account.Industry`, `record:Account.Industry`, …).
 * Also forwards the lightning-* error API (setCustomValidity,
 * reportValidity, focus) so the condition editor treats it like any other
 * control. fp- prefixed classes (LEX leak rule).
 */

/**
 * One describe per purpose + object + relationship for the whole editing
 * session, shared by every picker. Read and filter answers never share an
 * entry. A failed read is forgotten so a retry can work.
 */
const CACHE = new Map();

/** Fields no condition should offer. */
const POINTLESS = /(^|\.)IsDeleted$/;

function describe(objectApi, relationship, purpose = 'filter') {
    const read = purpose === 'read';
    const key = `${read ? 'read' : 'filter'}|${objectApi}|${relationship || ''}`;
    if (!CACHE.has(key)) {
        const pending = (read ? describeReadableFields : describeLookupFields)({
            objectApiName: objectApi,
            relationshipName: relationship || null
        })
            .then((out) => ({
                ...out,
                // Deleted records are never searched, so "Deleted" is a
                // condition that can only ever say the obvious.
                fields: ((out && out.fields) || []).filter(
                    (f) => !POINTLESS.test(f.path || '')
                )
            }))
            .catch((error) => {
                CACHE.delete(key);
                throw error;
            });
        CACHE.set(key, pending);
    }
    return CACHE.get(key);
}

/**
 * What a relationship reads as. The server labels it with its lookup field,
 * and standard lookups end in " ID" ("Account ID"); "Account › Industry"
 * reads better than "Account ID › Industry", as in the Form Designer.
 */
function relationshipLabel(rel) {
    return String(rel.label || rel.name).replace(/\s+ID$/, '');
}

/** For tests: start each one with an empty session. */
export function resetFieldCache() {
    CACHE.clear();
}

/**
 * The label a path should read as — "Industry", or "Account › Industry" —
 * from whatever describes this session has loaded (loading the one it
 * needs). Falls back to the path itself.
 */
export async function labelForPath(objectApi, path, purpose = 'filter') {
    if (!objectApi || !path) {
        return path || '';
    }
    try {
        const dot = path.indexOf('.');
        if (dot < 0) {
            const root = await describe(objectApi, null, purpose);
            const hit = (root.fields || []).find((f) => f.path === path);
            return hit ? hit.label : path;
        }
        const rel = path.slice(0, dot);
        const [root, related] = await Promise.all([
            describe(objectApi, null, purpose),
            describe(objectApi, rel, purpose)
        ]);
        const relMeta = (root.relationships || []).find((r) => r.name === rel);
        const hit = (related.fields || []).find((f) => f.path === path);
        return `${relMeta ? relationshipLabel(relMeta) : rel} › ${hit ? hit.label : path.slice(dot + 1)}`;
    } catch {
        return path;
    }
}

/**
 * A field's Salesforce type, lower case ('date', 'double', …), from the
 * session's describes — own fields and one hop. Null when it isn't there.
 */
export async function typeForPath(objectApi, path, purpose = 'filter') {
    if (!objectApi || !path) {
        return null;
    }
    try {
        const dot = path.indexOf('.');
        const list = await describe(
            objectApi,
            dot < 0 ? null : path.slice(0, dot),
            purpose
        );
        const hit = (list.fields || []).find((f) => f.path === path);
        return hit ? hit.type : null;
    } catch {
        return null;
    }
}

export default class FinalFieldPicker extends LightningElement {
    @api label = 'Field';
    @api variant;
    @api placeholder = 'Search fields';
    @api disabled = false;
    /** Put in front of every path this emits: '' | 'record:' | 'user:'. */
    @api prefix = '';
    /** Picked before the object's own fields, e.g. Profile name. */
    @api extraItems = [];
    /** 0 = the object's own fields only; unset = one hop (as always). */
    @api maxDepth;
    /** Lower-case describe types to offer; empty = every type. */
    @api allowedTypes = [];
    /** Relationship names that may be opened; empty = all of them. */
    @api allowedRelationships = [];

    _purpose = 'filter';

    /** 'filter' (default) or 'read'. Changing it reloads the fields. */
    @api
    get purpose() {
        return this._purpose;
    }
    set purpose(next) {
        const value = next === 'read' ? 'read' : 'filter';
        if (value !== this._purpose) {
            this._purpose = value;
            this.root = null;
            this.related = {};
            this.level = null;
            this._scheduleLoad();
        }
    }

    get _typeOk() {
        const allowed = this.allowedTypes || [];
        return (type) => !allowed.length || allowed.includes(type);
    }

    get _relOk() {
        const allowed = this.allowedRelationships || [];
        return (name) =>
            this.maxDepth !== 0 && (!allowed.length || allowed.includes(name));
    }

    _objectApi;
    _value = '';
    root = null;
    related = {}; // relationship name → { label, fields }
    level = null; // null = the object itself; else a relationship name
    loadError = '';

    @api
    get objectApi() {
        return this._objectApi;
    }
    set objectApi(next) {
        if (next !== this._objectApi) {
            this._objectApi = next;
            this.root = null;
            this.related = {};
            this.level = null;
            this._scheduleLoad();
        }
    }

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || '';
        // A saved related field reads as its label from the start.
        const rel = this._relationshipOf(this._value);
        if (rel && !this.related[rel]) {
            this._openRelationship(rel, false);
        }
    }

    /** An error asked for before the box has rendered. */
    _pendingError;

    @api
    setCustomValidity(message) {
        const box = this._box();
        if (box) {
            box.setCustomValidity(message);
        } else {
            this._pendingError = message;
        }
    }

    @api
    reportValidity() {
        const box = this._box();
        return box ? box.reportValidity() : true;
    }

    @api
    focus() {
        const box = this._box();
        if (box) {
            box.focus();
        }
    }

    _box() {
        return this.template.querySelector('c-final-typeahead');
    }

    renderedCallback() {
        // The box may render after the editor asked for an error.
        if (this._pendingError !== undefined) {
            const box = this._box();
            if (box) {
                box.setCustomValidity(this._pendingError);
                this._pendingError = undefined;
            }
        }
    }

    _pathOf(value) {
        return value && value.startsWith(this.prefix)
            ? value.slice(this.prefix.length)
            : value || '';
    }

    _relationshipOf(value) {
        const path = this._pathOf(value);
        const dot = path.indexOf('.');
        // Extra items (Profile.Name) are their own thing, not a relationship.
        if (dot < 0 || (this.extraItems || []).some((x) => x.value === value)) {
            return null;
        }
        return path.slice(0, dot);
    }

    /**
     * One load, after this tick's settings have all landed: a parent sets
     * object-api and purpose in either order, and loading on the first
     * would fetch the wrong list.
     */
    _scheduleLoad() {
        if (this._loadQueued) {
            return;
        }
        this._loadQueued = true;
        Promise.resolve().then(() => {
            this._loadQueued = false;
            this._load();
        });
    }

    async _load() {
        const objectApi = this._objectApi;
        if (!objectApi) {
            return;
        }
        try {
            const out = await describe(objectApi, null, this._purpose);
            if (objectApi === this._objectApi) {
                this.root = out;
                this.loadError = '';
            }
        } catch {
            if (objectApi === this._objectApi) {
                this.loadError = 'These fields couldn’t be read.';
            }
        }
    }

    async _openRelationship(rel, show) {
        const objectApi = this._objectApi;
        if (!objectApi) {
            return;
        }
        if (show) {
            // Go there at once; "Loading…" shows until its fields arrive.
            this.level = rel;
        }
        try {
            const [root, out] = await Promise.all([
                describe(objectApi, null, this._purpose),
                describe(objectApi, rel, this._purpose)
            ]);
            if (objectApi !== this._objectApi) {
                return;
            }
            const meta = (root.relationships || []).find((r) => r.name === rel);
            this.related = {
                ...this.related,
                [rel]: {
                    label: meta ? relationshipLabel(meta) : rel,
                    fields: out.fields || []
                }
            };
        } catch {
            if (this.level === rel) {
                this.level = null;
            }
            this.loadError = 'Those related fields couldn’t be read.';
        }
    }

    _relatedItems(rel, searchOnly) {
        const group = this.related[rel];
        if (!group) {
            return [];
        }
        const typeOk = this._typeOk;
        return group.fields
            .filter((f) => typeOk(f.type))
            .map((f) => ({
                value: this.prefix + f.path,
                label: `${group.label} › ${f.label}`,
                meta: f.path,
                type: f.type,
                searchOnly
            }));
    }

    get items() {
        if (this.level) {
            return [
                { value: '__back', label: 'Back to all fields', kind: 'back' },
                ...this._relatedItems(this.level, false)
            ];
        }
        const typeOk = this._typeOk;
        const relOk = this._relOk;
        const own = ((this.root && this.root.fields) || [])
            .filter((f) => typeOk(f.type))
            .map((f) => ({
                value: this.prefix + f.path,
                label: f.label,
                meta: f.path,
                type: f.type
            }));
        const groups = ((this.root && this.root.relationships) || [])
            .filter((r) => relOk(r.name))
            .map((r) => ({
                value: r.name,
                label: relationshipLabel(r),
                meta: r.object,
                searchText: r.name,
                kind: 'group'
            }));
        // Fields of relationships already opened join the search, without
        // lengthening the unfiltered list.
        const opened = Object.keys(this.related).flatMap((rel) =>
            this._relatedItems(rel, true)
        );
        return [...(this.extraItems || []), ...own, ...groups, ...opened];
    }

    get hint() {
        if (this.level) {
            const group = this.related[this.level];
            return group ? `${group.label} fields. Left Arrow goes back.` : '';
        }
        if (!this.root) {
            return '';
        }
        const relOk = this._relOk;
        const hasGroups = (this.root.relationships || []).some((r) =>
            relOk(r.name)
        );
        return hasGroups && Object.keys(this.related).length === 0
            ? 'Fields on related records appear when you open them (›).'
            : '';
    }

    get valueLabel() {
        const hit = this._allKnown().find((i) => i.value === this._value);
        return hit ? hit.label : this._pathOf(this._value);
    }

    _allKnown() {
        const own = ((this.root && this.root.fields) || []).map((f) => ({
            value: this.prefix + f.path,
            label: f.label,
            type: f.type
        }));
        const opened = Object.keys(this.related).flatMap((rel) =>
            this._relatedItems(rel, false)
        );
        return [...(this.extraItems || []), ...own, ...opened];
    }

    /** What the list says when it has nothing to show. */
    get emptyText() {
        if (this.loadError) {
            return this.loadError;
        }
        if (!this.root) {
            return 'Loading fields…';
        }
        if (this.level && !this.related[this.level]) {
            return 'Loading related fields…';
        }
        return 'No fields match';
    }

    get placeholderText() {
        return this.loadError || this.placeholder;
    }

    handleOpenGroup(event) {
        event.stopPropagation();
        this._openRelationship(event.detail.value, true);
    }

    handleBack(event) {
        event.stopPropagation();
        this.level = null;
    }

    /** Reopening the list starts from the object's own fields. */
    handleClose(event) {
        event.stopPropagation();
        this.level = null;
    }

    handlePick(event) {
        event.stopPropagation();
        const hit = this._allKnown().find(
            (i) => i.value === event.detail.value
        );
        this._value = event.detail.value;
        this.level = null;
        this.dispatchEvent(
            new CustomEvent('fieldchange', {
                detail: {
                    value: event.detail.value,
                    label: event.detail.label,
                    type: hit ? hit.type : undefined
                }
            })
        );
    }
}
