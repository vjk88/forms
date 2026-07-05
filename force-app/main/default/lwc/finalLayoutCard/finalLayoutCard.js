import { LightningElement, api } from 'lwc';

/**
 * finalLayoutCard — one layout choice in the creation flow's step 1.
 * A small neutral structural diagram (NOT themed — theme comes next step) + a
 * label/hint. Emits `select` { layout } on click/keyboard.
 */

const META = {
    scroll: { label: 'Continuous scroll', hint: 'Every section on one page.' },
    stepper: { label: 'Wizard steps', hint: 'Guided, step by step.' },
    tabs: { label: 'Tabbed pages', hint: 'Pages shown as tabs.' },
    accordion: { label: 'Accordion', hint: 'Collapsible panels.' },
    rail: { label: 'Side rail', hint: 'Navigation down the side.' },
    oneAtATime: { label: 'One at a time', hint: 'One question per screen.' },
    splitHero: { label: 'Split hero', hint: 'Brand panel beside the form.' }
};

export default class FinalLayoutCard extends LightningElement {
    @api layout;
    @api selected = false;

    get meta() {
        return META[this.layout] || { label: this.layout, hint: '' };
    }
    get rootClass() {
        return this.selected ? 'lc is-on' : 'lc';
    }
    get pressed() {
        return this.selected ? 'true' : 'false';
    }

    get isScroll() {
        return this.layout === 'scroll';
    }
    get isStepper() {
        return this.layout === 'stepper';
    }
    get isTabs() {
        return this.layout === 'tabs';
    }
    get isAccordion() {
        return this.layout === 'accordion';
    }
    get isRail() {
        return this.layout === 'rail';
    }
    get isOneAtATime() {
        return this.layout === 'oneAtATime';
    }
    get isSplit() {
        return this.layout === 'splitHero';
    }

    _emit() {
        this.dispatchEvent(
            new CustomEvent('select', { detail: { layout: this.layout } })
        );
    }
    handleClick() {
        this._emit();
    }
    handleKey(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._emit();
        }
    }
}
