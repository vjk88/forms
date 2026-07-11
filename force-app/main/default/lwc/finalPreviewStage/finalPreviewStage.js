import { LightningElement, api } from 'lwc';

/**
 * finalPreviewStage — the studio's device-preview harness (owner 2026-07-11).
 *
 * Problem it solves: the shells are responsive via CONTAINER queries, so a
 * half-width preview pane legitimately renders the tablet/mobile arrangement.
 * The stage lays the real viewer out at a fixed DEVICE width and scales it
 * down with a transform to fit the pane: transforms don't change layout size,
 * so container queries still see the device width and render the true
 * arrangement, then the result is shrunk visually (the App Builder / Webflow
 * canvas trick). No iframe — same component tree, one-parser rule intact.
 *
 * Also owns the preview toolbar (Desktop|Tablet|Mobile + restart) and forces
 * the viewer's `embedded` surface so embedded-only page treatments (corner
 * rounding, viewport-fill height) render regardless of the studio's host.
 * The synthetic device viewport rides `--frame-offset`: the page frame's
 * min-height is calc(100dvh - offset), so offset = 100dvh - deviceHeight
 * makes the canvas fill the device height exactly.
 *
 * Restart re-mounts the viewer via a keyed for:each (fresh answers, page
 * position, repeat entries — remount is the only reset that can't drift).
 */

const DEVICES = [
    { key: 'desktop', label: 'Desktop', width: 1280, height: 800 },
    { key: 'tablet', label: 'Tablet', width: 768, height: 1024 },
    { key: 'mobile', label: 'Mobile', width: 390, height: 844 }
];
const BY_KEY = Object.fromEntries(DEVICES.map((d) => [d.key, d]));

export default class FinalPreviewStage extends LightningElement {
    @api spec;
    @api authoring = false;

    device = 'desktop';
    scale = 1;
    offsetX = 0;

    frames = [{ key: 'f0' }];
    _seq = 0;
    _viewportRO;
    _canvasRO;
    _raf;

    get deviceButtons() {
        return DEVICES.map((d) => ({
            key: d.key,
            label: d.label,
            pressed: String(d.key === this.device),
            cls: d.key === this.device ? 'ps-device on' : 'ps-device'
        }));
    }

    get canvasStyle() {
        const dev = BY_KEY[this.device];
        return (
            `width:${dev.width}px;` +
            `transform:translateX(${this.offsetX}px) scale(${this.scale});` +
            `--frame-offset: calc(100dvh - ${dev.height}px);`
        );
    }

    handleDevice(event) {
        this.device = event.currentTarget.dataset.device;
        this._sync();
    }

    handleRefresh() {
        this._seq += 1;
        this.frames = [{ key: `f${this._seq}` }];
    }

    /** elementselect is a plain non-bubbling event — relay it across this
     *  shadow boundary so the studio's preview-click sync keeps working. */
    handleElementSelect(event) {
        this.dispatchEvent(
            new CustomEvent('elementselect', { detail: event.detail })
        );
    }

    renderedCallback() {
        if (this._viewportRO || typeof ResizeObserver === 'undefined') {
            return;
        }
        const viewport = this.template.querySelector('.ps-viewport');
        const canvas = this.template.querySelector('.ps-canvas');
        if (!viewport || !canvas) {
            return;
        }
        // pane resizes change the scale; content growth changes the height
        this._viewportRO = new ResizeObserver(() => this._sync());
        this._viewportRO.observe(viewport);
        this._canvasRO = new ResizeObserver(() => this._sync());
        this._canvasRO.observe(canvas);
        this._sync();
    }

    disconnectedCallback() {
        if (this._viewportRO) {
            this._viewportRO.disconnect();
            this._viewportRO = undefined;
        }
        if (this._canvasRO) {
            this._canvasRO.disconnect();
            this._canvasRO = undefined;
        }
        if (this._raf) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    _sync() {
        if (this._raf) {
            return;
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._raf = requestAnimationFrame(() => {
            this._raf = null;
            this._apply();
        });
    }

    _apply() {
        const viewport = this.template.querySelector('.ps-viewport');
        const canvas = this.template.querySelector('.ps-canvas');
        if (!viewport || !canvas) {
            return;
        }
        const dev = BY_KEY[this.device];
        const paneWidth = viewport.clientWidth;
        // never upscale — small devices center at 1:1 instead of blowing up
        const scale = Math.min(1, paneWidth / dev.width);
        this.scale = scale;
        this.offsetX = Math.max(0, (paneWidth - dev.width * scale) / 2);
        // the scaled canvas still OCCUPIES its unscaled layout height — pin
        // the viewport to the visual height so the outer scroll matches
        const height = `${Math.ceil(canvas.offsetHeight * scale)}px`;
        if (viewport.style.height !== height) {
            viewport.style.height = height;
        }
    }
}
