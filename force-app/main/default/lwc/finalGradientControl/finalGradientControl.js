import { LightningElement, api } from 'lwc';

/**
 * finalGradientControl — Solid | Gradient surface input (owner QA 2026-07-07,
 * FormBuilder pattern: presets · linear/radial · angle · start/end).
 *
 * Dumb leaf like finalColorControl: parent owns cascade state and echoes
 * `solid`/`gradient` back down; this control emits ONE `change`
 * { solid, gradient } where gradient is null in Solid mode. The gradient
 * object is the engine's shape: { type, angle, start, end }.
 */

const PRESETS = [
    ['#059669', '#064e3b'],
    ['#7c3aed', '#4c1d95'],
    ['#f0abfc', '#c026d3'],
    ['#38bdf8', '#1d4ed8'],
    ['#fb923c', '#ea580c'],
    ['#1e3a8a', '#0f172a'],
    ['#e2e8f0', '#94a3b8'],
    ['#c084fc', '#7c3aed']
];

export default class FinalGradientControl extends LightningElement {
    @api label;
    @api edited = false;
    @api disabled = false;

    _solid = '#ffffff';
    _gradient = null;

    @api
    get solid() {
        return this._solid;
    }
    set solid(v) {
        if (typeof v === 'string' && v) {
            this._solid = v;
        }
    }

    @api
    get gradient() {
        return this._gradient;
    }
    set gradient(v) {
        this._gradient = v && v.start && v.end ? { ...v } : null;
    }

    get isGradient() {
        return Boolean(this._gradient);
    }

    get isLinear() {
        return !this._gradient || this._gradient.type !== 'radial';
    }

    get solidSegClass() {
        return this.isGradient ? 'seg-btn' : 'seg-btn on';
    }

    get gradientSegClass() {
        return this.isGradient ? 'seg-btn on' : 'seg-btn';
    }

    get angle() {
        return this._gradient && Number.isFinite(Number(this._gradient.angle))
            ? Number(this._gradient.angle)
            : 135;
    }

    get start() {
        return (this._gradient && this._gradient.start) || this._solid;
    }

    get end() {
        return (this._gradient && this._gradient.end) || '#0f172a';
    }

    get typeOptions() {
        const t = this._gradient ? this._gradient.type : 'linear';
        return [
            { value: 'linear', label: 'Linear', selected: t !== 'radial' },
            { value: 'radial', label: 'Radial', selected: t === 'radial' }
        ];
    }

    get presets() {
        return PRESETS.map(([a, b], i) => ({
            key: `p${i}`,
            start: a,
            end: b,
            style: `background: linear-gradient(135deg, ${a}, ${b})`
        }));
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('change', {
                detail: {
                    solid: this._solid,
                    gradient: this._gradient ? { ...this._gradient } : null
                }
            })
        );
    }

    handleSolidMode() {
        if (!this.isGradient) {
            return;
        }
        this._gradient = null;
        this._emit();
    }

    handleGradientMode() {
        if (this.isGradient) {
            return;
        }
        this._gradient = {
            type: 'linear',
            angle: 135,
            start: this._solid,
            end: PRESETS[0][1]
        };
        this._emit();
    }

    handleSolidColor(event) {
        this._solid = event.target.value;
        this._emit();
    }

    handlePreset(event) {
        const { start, end } = event.currentTarget.dataset;
        this._gradient = { ...this._gradient, start, end };
        this._emit();
    }

    handleType(event) {
        this._gradient = { ...this._gradient, type: event.target.value };
        this._emit();
    }

    handleAngle(event) {
        this._gradient = {
            ...this._gradient,
            angle: Number(event.target.value)
        };
        this._emit();
    }

    handleStart(event) {
        this._gradient = { ...this._gradient, start: event.target.value };
        this._emit();
    }

    handleEnd(event) {
        this._gradient = { ...this._gradient, end: event.target.value };
        this._emit();
    }
}
