import { LightningElement, api } from 'lwc';

/**
 * Recursive container renderer — the SINGLE implementation of zones/columns/
 * stacks (LAYOUT_SPEC §5/§7). Shells compose this; they never reimplement it.
 * Receives one page's enriched zone view-model from the engine.
 */
export default class LayoutZones extends LightningElement {
    @api zones = []; // [{ key, span, sticky, children:[{ key, isStack, sections[] } | { key, isColumns, style, tracks:[{key, sections[]}] }] }]
    @api mode = 'preview';

    // Reflow to a single column is handled entirely by a CSS container query
    // (layoutZones.css) — the host measures its OWN width, so it works inside
    // any-width Lightning region without the engine's (unreliable) ResizeObserver.

    get zoneList() {
        return (this.zones || []).map((z) => ({
            ...z,
            cls: `zone${z.sticky ? ' sticky' : ''}`,
            style: `grid-column: span ${z.span};`
        }));
    }
}
