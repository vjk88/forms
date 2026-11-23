import { LightningElement, api } from 'lwc';

/**
 * finalStudioRail — the Studio's vertical icon rail (Build tools + Design
 * pane share it, IMPL_PLAN_DESIGN_RAIL). Icons with tiny labels stacked on the
 * left edge; the selected tab is teal and announced with aria-pressed.
 *
 *   tabs   [{ key, label, icon, dot?, divider? }]: `dot` marks a tab with
 *          customized settings, `divider` draws a rule above that tab
 *   value  the selected tab's key
 *   label  the nav's accessible name
 *   orientation  'vertical' (default, the left-edge rail) or 'horizontal' (a
 *          strip for narrow workspaces: tabs in a row, scrolls sideways if it
 *          doesn't fit, selected = bottom bar instead of leading bar)
 *
 * Dispatches `select` { key } on a click; the host owns the selection.
 */
export default class FinalStudioRail extends LightningElement {
    @api tabs = [];
    @api value;
    @api label = 'Sections';
    @api orientation = 'vertical';

    /** True while a horizontal strip has more tabs hidden past its trailing
     *  edge: only then does the edge fade (a "scroll for more" cue). */
    more = false;
    _ro;

    get navClass() {
        if (this.orientation !== 'horizontal') {
            return 'rail';
        }
        return this.more ? 'rail rail--h rail--more' : 'rail rail--h';
    }

    renderedCallback() {
        this._measure();
        const nav = this.template.querySelector('nav');
        if (nav !== this._observed) {
            if (this._ro) {
                this._ro.disconnect();
                this._ro = undefined;
            }
            this._observed = nav;
            if (nav && typeof ResizeObserver !== 'undefined') {
                this._ro = new ResizeObserver(() => this._measure());
                this._ro.observe(nav);
            }
        }
    }

    disconnectedCallback() {
        if (this._ro) {
            this._ro.disconnect();
            this._ro = undefined;
        }
        this._observed = undefined;
    }

    _measure() {
        const nav = this.template.querySelector('nav');
        const more =
            this.orientation === 'horizontal' &&
            !!nav &&
            nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 1;
        if (more !== this.more) {
            this.more = more;
        }
    }

    handleScroll() {
        this._measure();
    }

    get items() {
        return (this.tabs || []).map((t) => {
            const on = t.key === this.value;
            return {
                ...t,
                cls: on ? 'rail-tab on' : 'rail-tab',
                pressed: on ? 'true' : 'false'
            };
        });
    }

    handleClick(event) {
        this.dispatchEvent(
            new CustomEvent('select', {
                detail: { key: event.currentTarget.dataset.tab }
            })
        );
    }
}
