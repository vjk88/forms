import { LightningElement, api } from 'lwc';
import { resolveTheme, THEMES } from 'c/formThemes';

/**
 * c/layoutThumb — a lightweight, theme-tinted CSS mini-mockup of a canonical
 * LAYOUT's structure (where the panel / rail / steps / fields sit). NOT a live
 * engine render — it's an iconic little diagram, cheap to mount in a grid.
 *
 * Reusable: the creation gallery's "Start from scratch" grid uses it now; the
 * form-designer layout picker will use it later. Give it a layout + a theme
 * (themeId/skinId, optional accent) and it draws itself.
 */
const LAYOUTS = [
    'stacked', 'bento', 'stepper', 'splitHero',
    'sideNav', 'oneAtATime', 'tabbed', 'accordion'
];

export default class LayoutThumb extends LightningElement {
    @api layout = 'stacked';
    @api themeId = 'cloud';
    @api skinId;
    @api accent;

    get _skin() {
        const sid = this.skinId || (THEMES[this.themeId] && THEMES[this.themeId].defaultSkin);
        return resolveTheme(this.themeId, sid, this.accent ? { accent: this.accent } : undefined);
    }
    get stageClass() {
        const s = this._skin;
        let c = 'lt-stage';
        if (s.dark) c += ' is-dark';
        if (s.glass) c += ' is-glass';
        return c;
    }
    get stageStyle() {
        return `background:${this._skin.pageBg || '#f3f3f3'};`;
    }
    get cardStyle() {
        const s = this._skin.surface;
        const surface = s && s !== 'transparent' ? s : '#ffffff';
        return `background:${surface};`;
    }
    get accentStyle() {
        return `background:${this._skin.accent || '#0176d3'};`;
    }

    // One flag per canonical layout (LWC templates can't switch on a value).
    get isStacked()    { return this.layout === 'stacked'; }
    get isBento()      { return this.layout === 'bento'; }
    get isStepper()    { return this.layout === 'stepper'; }
    get isSplitHero()  { return this.layout === 'splitHero'; }
    get isSideNav()    { return this.layout === 'sideNav'; }
    get isOneAtATime() { return this.layout === 'oneAtATime'; }
    get isTabbed()     { return this.layout === 'tabbed'; }
    // Accordion is the catch-all so an unknown layout still renders something.
    get isAccordion()  { return !LAYOUTS.slice(0, 7).includes(this.layout); }
}
