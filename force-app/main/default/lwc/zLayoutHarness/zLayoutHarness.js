import { LightningElement, track } from 'lwc';
import { materialize, CORE_ARCHETYPES } from 'c/layoutModel';
import { LAYOUT_TEMPLATES } from 'c/formThemes';
import { SEEDS } from 'c/layoutFixtures';

/**
 * T17 QA harness (z = internal tooling, not shipped).
 * Single view: archetype × skin × density × seed × viewport.
 * Matrix view: every core archetype as a 0.18-scale mini engine + render time.
 * Shells that aren't built yet show the engine's friendly notice — that is
 * the expected state until T7–T16 land. Verify each board here in < 30s.
 */
const VIEWPORTS = [
    { label: 'Mobile 375', value: '375px' },
    { label: 'Tablet 768', value: '768px' },
    { label: 'Laptop 1024', value: '1024px' },
    { label: 'Full width', value: '100%' }
];

export default class ZLayoutHarness extends LightningElement {
    @track archetype = 'classic';
    @track skinName = 'classic';
    @track density = 'comfortable';
    @track seedName = 'contact';
    @track viewport = '100%';
    @track matrixMode = false;
    @track matrixMs;
    @track liveMode = false;
    @track lastValueEvent = '';
    // T2.3 smoke: a Form__c Id here swaps the stage to <c-form-viewer>.
    @track viewerFormId = '';
    // Creation redesign smoke: render the gallery-first create experience.
    @track galleryMode = false;
    _matrixT0;

    archetypeOptions = CORE_ARCHETYPES.map((a) => ({ label: a, value: a }));
    skinOptions = Object.keys(LAYOUT_TEMPLATES).map((k) => ({ label: LAYOUT_TEMPLATES[k].label, value: k }));
    densityOptions = [
        { label: 'Comfortable', value: 'comfortable' },
        { label: 'Compact', value: 'compact' }
    ];
    seedOptions = Object.keys(SEEDS).map((k) => ({ label: SEEDS[k].label, value: k }));
    viewportOptions = VIEWPORTS;

    get seed() {
        return SEEDS[this.seedName];
    }
    get skin() {
        return LAYOUT_TEMPLATES[this.skinName];
    }
    get spec() {
        const s = materialize(this.archetype, this.seed.pages, this.seed.sections);
        s.density = this.density;
        return s;
    }
    get stageStyle() {
        return `width: ${this.viewport}; max-width: 100%; margin: 0 auto;`;
    }
    get matrixLabel() {
        return this.matrixMode ? 'Single view' : 'Matrix view (all archetypes)';
    }
    get matrixItems() {
        return CORE_ARCHETYPES.map((id) => {
            const s = materialize(id, this.seed.pages, this.seed.sections);
            s.density = this.density;
            return { id, spec: s };
        });
    }

    // Live mode (T2.2): real record-edit-forms via c/formSectionRenderer.
    // Only the LIVE seeds carry an objectApiName + body-JSON-shaped elements.
    get isLive() {
        return this.liveMode && !!this.seed.objectApiName;
    }
    get engineMode() {
        return this.isLive ? 'live' : 'preview';
    }
    get liveDisabled() {
        return !this.seed.objectApiName;
    }
    handleLiveToggle(e) {
        this.liveMode = e.target.checked;
        this.lastValueEvent = '';
    }
    handleSectionValue(e) {
        const d = e.detail || {};
        this.lastValueEvent = `${d.sectionKey}: ${JSON.stringify(d.values)}`;
    }

    get viewerMode() {
        return !!this.viewerFormId;
    }
    handleViewerFormId(e) {
        this.viewerFormId = (e.target.value || '').trim();
    }
    handleGalleryToggle(e) {
        this.galleryMode = e.target.checked;
    }
    handleGalleryCreated(e) {
        const d = e.detail || {};
        this.lastValueEvent = `created form ${d.formId} (version ${d.versionId})`;
    }

    handleArchetype(e) { this.archetype = e.detail.value; }
    handleSkin(e) { this.skinName = e.detail.value; }
    handleDensity(e) { this.density = e.detail.value; }
    handleSeed(e) { this.seedName = e.detail.value; }
    handleViewport(e) { this.viewport = e.detail.value; }

    toggleMatrix() {
        this.matrixMode = !this.matrixMode;
        this.matrixMs = undefined;
        if (this.matrixMode) {
            this._matrixT0 = performance.now();
        }
    }

    renderedCallback() {
        // Perf number: full matrix render wall time (logged once per toggle).
        if (this.matrixMode && this._matrixT0 !== undefined) {
            const ms = Math.round(performance.now() - this._matrixT0);
            this._matrixT0 = undefined; // clear BEFORE the tracked write (re-render guard)
            this.matrixMs = ms;
        }
    }
}
