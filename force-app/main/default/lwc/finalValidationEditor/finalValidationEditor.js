import { LightningElement, api } from 'lwc';

/**
 * finalValidationEditor — a field's extra checks (schema §7, BUILDER_SURFACES
 * §4). PRESET-BASED for people who don't code (owner 2026-07-10: "formula
 * expressions are wild… this is for simple users"): Email / Phone / Web
 * address / Number range / Text length / Match another answer. Presets
 * compile to ordinary §7 entries (pattern/range/custom) — the runtime never
 * learns new shapes; the `preset` key (+ minLen/maxLen) is round-trip sugar
 * the parsers ignore.
 *
 * `required` is NOT listed here — the inspector's Behavior control owns that
 * entry (schema §4 sugar rule); the studio merges on save.
 *
 * DUMB view: emits the FULL next entries array as `validationchange`
 * {entries}. ve- prefixed classes (LEX leak rule).
 */

const PRESETS = [
    {
        key: 'email',
        label: 'Email format',
        make: () => ({
            type: 'pattern',
            preset: 'email',
            pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            message: 'Enter a valid email address.'
        })
    },
    {
        key: 'phone',
        label: 'Phone format',
        make: () => ({
            type: 'pattern',
            preset: 'phone',
            pattern: '^[+()\\-.\\s\\d]{7,20}$',
            message: 'Enter a valid phone number.'
        })
    },
    {
        key: 'url',
        label: 'Web address',
        make: () => ({
            type: 'pattern',
            preset: 'url',
            pattern: '^(https?://)?[\\w.-]+\\.[A-Za-z]{2,}([/?#].*)?$',
            message: 'Enter a valid web address.'
        })
    },
    {
        key: 'range',
        label: 'Number range',
        make: () => ({
            type: 'range',
            min: null,
            max: null,
            message: 'This number is out of range.'
        })
    },
    {
        key: 'length',
        label: 'Text length',
        make: () => ({
            type: 'pattern',
            preset: 'length',
            minLen: 0,
            maxLen: 255,
            pattern: lengthPattern(0, 255),
            message: 'The text length is not valid.'
        })
    },
    {
        key: 'match',
        label: 'Match another answer',
        make: () => ({
            type: 'custom',
            compareTo: '',
            operator: 'equals',
            message: 'The answers must match.'
        })
    }
];

function lengthPattern(min, max) {
    return `^[\\s\\S]{${min || 0},${max || ''}}$`;
}

/** Which preset an entry belongs to (round-trip via the sugar key). */
function presetOf(entry) {
    if (entry.preset) {
        return entry.preset;
    }
    if (entry.type === 'range') {
        return 'range';
    }
    if (entry.type === 'custom') {
        return 'match';
    }
    return 'email';
}

export default class FinalValidationEditor extends LightningElement {
    /** Validation entries WITHOUT the required entry (panel filters). */
    @api entries = [];
    /** [{id, label}] — compareTo candidates for Match another answer. */
    @api sources = [];

    get rows() {
        return (this.entries || []).map((entry, i) => {
            const preset = presetOf(entry);
            return {
                key: `v_${i}`,
                index: i,
                entry,
                isRange: preset === 'range',
                isLength: preset === 'length',
                isMatch: preset === 'match',
                presetOptions: PRESETS.map((p) => ({
                    value: p.key,
                    label: p.label,
                    selected: p.key === preset ? true : undefined
                })),
                sourceOptions: (this.sources || []).map((s) => ({
                    value: s.id,
                    label: s.label,
                    selected: s.id === entry.compareTo ? true : undefined
                }))
            };
        });
    }

    get empty() {
        return !(this.entries || []).length;
    }

    _emit(entries) {
        this.dispatchEvent(
            new CustomEvent('validationchange', { detail: { entries } })
        );
    }

    _next() {
        return JSON.parse(JSON.stringify(this.entries || []));
    }

    handleAdd() {
        const next = this._next();
        next.push(PRESETS[0].make());
        this._emit(next);
    }

    handleRemove(event) {
        const next = this._next();
        next.splice(Number(event.currentTarget.dataset.index), 1);
        this._emit(next);
    }

    /** Switching preset resets the entry to that preset's shape — stale
     *  params never linger; a custom message survives. */
    handlePreset(event) {
        const i = Number(event.currentTarget.dataset.index);
        const preset = PRESETS.find((p) => p.key === event.target.value);
        if (!preset) {
            return;
        }
        const next = this._next();
        const message = next[i] && next[i].message;
        next[i] = preset.make();
        if (message) {
            next[i].message = message;
        }
        this._emit(next);
    }

    handleParam(event) {
        const { index, param } = event.currentTarget.dataset;
        const next = this._next();
        const entry = next[Number(index)];
        if (!entry) {
            return;
        }
        let v = event.target.value;
        if (['min', 'max', 'minLen', 'maxLen'].includes(param)) {
            v = v === '' ? null : Number(v);
        }
        entry[param] = v;
        // length edits recompile the pattern the engine actually runs
        if (entry.preset === 'length') {
            entry.pattern = lengthPattern(entry.minLen, entry.maxLen);
        }
        this._emit(next);
    }
}
