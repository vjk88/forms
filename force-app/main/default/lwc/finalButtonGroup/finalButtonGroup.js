import { LightningElement, api } from 'lwc';

/**
 * The Studio's one button group (DESIGN_SYSTEM 5.7, owner 2026-11-01): every
 * "pick one of a few" row of buttons uses this, never a hand-made row.
 * Joined buttons, the chosen one filled teal, like the Build/Design switch.
 * Tab moves between the buttons, as the hand-made rows did.
 *
 * Fires `change` with `detail.value` = the clicked option's value (its
 * original type, not a string), every click, including the chosen one,
 * because the hand-made rows it replaces did the same.
 */
export default class FinalButtonGroup extends LightningElement {
    /** Read by screen readers as the group's name. */
    @api label;
    /** [{ label, value, title?, disabled? }] */
    @api options = [];
    /** The chosen option's value. */
    @api value;
    @api disabled = false;
    /** Fill the row's width, buttons sharing it equally (inspector rows). */
    @api stretch = false;

    get groupClass() {
        return this.stretch ? 'bg bg-stretch' : 'bg';
    }

    get items() {
        return (this.options || []).map((o, index) => {
            const on = o.value === this.value;
            return {
                key: `${index}-${String(o.value)}`,
                index,
                dataValue: String(o.value),
                label: o.label,
                title: o.title,
                disabled: Boolean(this.disabled || o.disabled),
                pressed: on ? 'true' : 'false',
                cls: on ? 'bg-btn on' : 'bg-btn'
            };
        });
    }

    handleClick(event) {
        const option = (this.options || [])[
            Number(event.currentTarget.dataset.index)
        ];
        if (!option) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent('change', { detail: { value: option.value } })
        );
    }
}
