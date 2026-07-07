import { LightningElement, track } from 'lwc';
import { buildSampleSpec } from 'c/finalSampleSpec';

/**
 * finalDesignTest — P2 verification host (the P0-test pattern, one page up).
 *
 * Left: c/finalDesignPanel. Right: the REAL c/finalFormViewer on the inline
 * `spec` path (one-parser rule — the preview IS the runtime). The host owns
 * the spec and echoes panel `specchange` down into both children. A layout
 * switcher exercises layout-conditional controls and the chrome-survival
 * checks. Replaced by formStudio's Design mode in P3.
 */
export default class FinalDesignTest extends LightningElement {
    @track spec = buildSampleSpec({
        layout: 'stepper',
        themeKey: 'editorialIvory'
    });

    layouts = [
        'scroll',
        'stepper',
        'tabs',
        'accordion',
        'rail',
        'oneAtATime',
        'splitHero'
    ];

    get layoutOptions() {
        const current = this.spec.layout.type;
        return this.layouts.map((l) => ({
            value: l,
            label: l,
            selected: l === current
        }));
    }

    handleLayout(event) {
        const next = JSON.parse(JSON.stringify(this.spec));
        next.layout.type = event.target.value;
        this.spec = next;
    }

    handleSpecChange(event) {
        this.spec = event.detail.spec;
    }

    // ----- custom-theme editor (opened only via the panel's explicit action) -----
    @track editorOpen = false;
    editorThemeId = null;
    editorStartFrom = null;

    handleThemeEdit(event) {
        this.editorThemeId = event.detail.themeId;
        this.editorStartFrom = event.detail.startFrom;
        this.editorOpen = true;
    }

    handleEditorCancel() {
        this.editorOpen = false;
    }

    async handleThemeSaved(event) {
        this.editorOpen = false;
        const next = JSON.parse(JSON.stringify(this.spec));
        next.theme = {
            source: 'custom',
            name: event.detail.id,
            overrides: {}
        };
        this.spec = next;
        const panel = this.template.querySelector('c-final-design-panel');
        if (panel) {
            await panel.refreshThemes();
        }
    }
}
