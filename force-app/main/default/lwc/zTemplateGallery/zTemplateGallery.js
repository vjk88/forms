import { LightningElement, api } from 'lwc';
import { LAYOUT_TEMPLATES } from 'c/zFormThemes';

const ORDER = [
    'classic', 'split', 'immersive', 'stepped', 'compact',
    'splitSidebarImg', 'floatingCardSplit', 'splitBgOverlay', 'asymmetricLanding',
    'verticalStackedInfo', 'verticalStackedInputs', 'multiStepWizard', 
    'threeColumnDashboard', 'focusModalPopup', 'multiCardGrid'
];

/**
 * Visual layout picker. Each tile is a tiny mock-up of that layout's STRUCTURE
 * (where elements sit), tinted with the template's default colours. Emits a
 * `select` event with { name } when a tile is clicked.
 */
export default class ZTemplateGallery extends LightningElement {
    @api selected;

    get templates() {
        return ORDER.map((name) => {
            const t = LAYOUT_TEMPLATES[name];
            if (!t) return null;
            const surface = t.surface || '#ffffff';
            return {
                name,
                label: t.label,
                thumbClass:
                    this.selected === name ? 'tg-thumb is-selected' : 'tg-thumb',
                isClassic: name === 'classic',
                isSplit: name === 'split',
                isImmersive: name === 'immersive',
                isStepped: name === 'stepped',
                isCompact: name === 'compact',
                isSplitSidebarImg: name === 'splitSidebarImg',
                isFloatingCardSplit: name === 'floatingCardSplit',
                isSplitBgOverlay: name === 'splitBgOverlay',
                isAsymmetricLanding: name === 'asymmetricLanding',
                isVerticalStackedInfo: name === 'verticalStackedInfo',
                isVerticalStackedInputs: name === 'verticalStackedInputs',
                isMultiStepWizard: name === 'multiStepWizard',
                isThreeColumnDashboard: name === 'threeColumnDashboard',
                isFocusModalPopup: name === 'focusModalPopup',
                isMultiCardGrid: name === 'multiCardGrid',
                stageStyle: `background:${t.pageBg};`,
                cardStyle: `background:${surface};`,
                glassStyle: 'background:rgba(255,255,255,0.16);',
                accentStyle: `background:${t.accent};`
            };
        }).filter(Boolean);
    }

    handleSelect(event) {
        this.dispatchEvent(
            new CustomEvent('select', {
                detail: { name: event.currentTarget.dataset.name }
            })
        );
    }
}
