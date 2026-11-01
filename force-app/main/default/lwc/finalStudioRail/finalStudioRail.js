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
 *
 * Dispatches `select` { key } on a click; the host owns the selection.
 */
export default class FinalStudioRail extends LightningElement {
    @api tabs = [];
    @api value;
    @api label = 'Sections';

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
