import { LightningElement, api } from 'lwc';
import {
    DEVICES,
    PHONES,
    HOSTS,
    resolveFrame,
    normalizeFrame
} from './previewFrame';

/**
 * finalPreviewStage — the studio's device-preview harness (owner 2026-07-11).
 *
 * Problem it solves: the shells are responsive via CONTAINER queries, so a
 * half-width preview pane legitimately renders the tablet/mobile arrangement.
 * The stage lays the real viewer out at a fixed DEVICE width and shrinks it
 * with CSS `zoom` to fit the pane: container queries still see the device
 * width (in the canvas's own px) and render the true arrangement, then the
 * result is drawn smaller. It was a `transform: scale()` until 2026-11-22;
 * a transform traps position:fixed popups (the date picker opened
 * off-screen), zoom does not. Zoom does snap borders to whole screen pixels,
 * so a 2px line can draw as 1px at Fit (the Tabs underline vanishes there;
 * owner: leave it). No iframe — same component tree, one-parser rule intact.
 *
 * The frame is the SCREEN (Desktop, Tablet, or a 320/360/390 phone) plus the
 * margin the host page leaves around the form (Public site, Lightning tab or
 * none); the viewer is laid out at screen minus both margins, exactly the width
 * the real page gives it (previewFrame.js holds the measured numbers).
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

export default class FinalPreviewStage extends LightningElement {
    @api spec;
    @api authoring = false;
    @api preserveSession = false;
    @api session;
    @api recordContext;
    /** Studio only: preview the form in this language (Translate screen). */
    @api previewLanguage;
    /** Opt-in: the host that can give the stage more room shows the toggle.
     *  The stage only asks (`previewexpand`); the host owns the layout and
     *  feeds the result back through `expanded`. */
    @api expandable = false;
    @api expanded = false;
    previewState;

    connectedCallback() {
        const frame = normalizeFrame(this.session);
        this.device = frame.device;
        this.phone = frame.phone;
        this.host = frame.host;
        this.zoom = this.session?.zoom === 'actual' ? 'actual' : 'fit';
        this.previewState = this.session?.viewer;
    }

    @api
    getSession() {
        return {
            device: this.device,
            phone: this.phone,
            host: this.host,
            zoom: this.zoom,
            viewer: this.template
                .querySelector('c-final-form-viewer')
                ?.getPreviewState()
        };
    }

    handlePreviewReady() {
        // Drop the hand-off snapshot after the viewer adopts it. Deleted
        // files must not linger in an obsolete seed held by either host.
        this.previewState = undefined;
        this.dispatchEvent(new CustomEvent('sessionconsumed'));
    }

    device = 'desktop';
    phone = '390';
    host = 'public';
    zoom = 'fit';
    scale = 1;
    offsetX = 0;

    frames = [{ key: 'f0' }];
    _seq = 0;
    _viewportRO;
    _canvasRO;
    _raf;

    /** finalButtonGroup options (DESIGN_SYSTEM 5.7). */
    get deviceOptions() {
        return DEVICES.map((d) => ({ label: d.label, value: d.key }));
    }

    get frame() {
        return resolveFrame({
            device: this.device,
            phone: this.phone,
            host: this.host
        });
    }

    get isMobile() {
        return this.device === 'mobile';
    }

    get phoneOptions() {
        return PHONES.map((p) => ({
            label: p.label,
            value: p.key,
            title: p.title
        }));
    }

    /** Each host's entry carries the margin it leaves, for THIS kind of screen. */
    get hostOptions() {
        return HOSTS.map((h) => {
            const margin = h.margin[this.device];
            return {
                key: h.key,
                label: margin ? `${h.label} · ${margin} px` : h.label,
                selected: h.key === this.host
            };
        });
    }

    /** What the margin control means, for the tooltip AND as its spoken description. */
    get hostHelp() {
        return 'Preview only, nothing on your form changes. The striped bands show the margin the page leaves around your form.';
    }

    /** The canvas is the screen; the host margin is padding inside it, so the
     *  viewer (and every container query under it) sees screen - 2 x margin. */
    get canvasStyle() {
        const frame = this.frame;
        return (
            `width:${frame.screenWidth}px;` +
            `padding-inline:${frame.margin}px;` +
            'box-sizing:border-box;' +
            `--ps-margin:${frame.margin}px;` +
            // CSS zoom, not transform: a transformed ancestor becomes the
            // containing block for position:fixed, which threw Salesforce's
            // date picker calendar ~940px off-screen at Fit. The margin is
            // written in the canvas's own (zoomed) px, so it is divided back.
            `zoom:${this.scale};` +
            `margin-left:${this.offsetX / this.scale}px;` +
            `--frame-offset: calc(100dvh - ${frame.screenHeight}px);`
        );
    }

    get zoomOptions() {
        return [
            {
                value: 'fit',
                label: 'Fit',
                title: 'Fit desktop or device width in the preview pane'
            },
            {
                value: 'actual',
                label: '100%',
                title: 'Show actual size; scroll horizontally when needed'
            }
        ];
    }

    get scaleLabel() {
        return `${Math.round(this.scale * 100)}%`;
    }

    get expandLabel() {
        return this.expanded ? 'Collapse preview' : 'Expand preview';
    }

    get expandedAria() {
        return String(this.expanded);
    }

    handleExpand() {
        this.dispatchEvent(
            new CustomEvent('previewexpand', {
                detail: { expanded: !this.expanded }
            })
        );
    }

    handleZoom(event) {
        this.zoom = event.detail.value;
        this._sync();
    }

    handleDevice(event) {
        this.device = event.detail.value;
        this._sync();
    }

    handlePhone(event) {
        this.phone = event.detail.value;
        this._sync();
    }

    handleHost(event) {
        this.host = normalizeFrame({ host: event.target.value }).host;
        this._sync();
    }

    handleRefresh() {
        this.previewState = undefined;
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
        const surface = this.template.querySelector('.ps-surface');
        if (!viewport || !canvas || !surface) {
            return;
        }
        const screenWidth = this.frame.screenWidth;
        const paneWidth = viewport.clientWidth;
        if (!paneWidth) {
            return;
        }
        // never upscale — small devices center at 1:1 instead of blowing up
        const scale =
            this.zoom === 'actual' ? 1 : Math.min(1, paneWidth / screenWidth);
        this.scale = scale;
        this.offsetX = Math.max(0, (paneWidth - screenWidth * scale) / 2);
        // Size the surface to the visual canvas (offsetHeight reads the
        // canvas's own, unzoomed px). The viewport can then scroll at 100% without ghost overflow
        // in Fit mode, and its horizontal scrollbar has its own layout space.
        const width = `${Math.max(paneWidth, screenWidth * scale)}px`;
        const height = `${Math.ceil(canvas.offsetHeight * scale)}px`;
        if (surface.style.width !== width) {
            surface.style.width = width;
        }
        if (surface.style.height !== height) {
            surface.style.height = height;
        }
        if (this.zoom === 'fit') {
            viewport.scrollLeft = 0;
        }
    }
}
