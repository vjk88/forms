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
}
