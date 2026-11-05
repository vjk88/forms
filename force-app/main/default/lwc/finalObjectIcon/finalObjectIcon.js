import { LightningElement, api, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';

const SIZES = { small: 'x-small', medium: 'small', large: 'medium' };

/**
 * "/img/icon/t4v35/standard/account_120.png" -> "standard:account";
 * ".../custom/custom57_120.png" -> "custom:custom57". Anything else -> ''.
 */
export function iconNameFromUrl(url) {
    const m = /\/(standard|custom)\/([a-z0-9_]+?)(?:_\d+)?\.(?:png|svg)$/i.exec(
        url || ''
    );
    return m ? `${m[1]}:${m[2].toLowerCase()}` : '';
}

/**
 * finalObjectIcon: an object's own Salesforce icon, in the color Salesforce
 * gives it (DESIGN_SYSTEM 8, owner 2026-11-02). The color is the object's
 * identity, not Studio chrome, so it is the one place Studio shows it. An
 * object without a tab has no icon: its first letter on its color instead.
 */
export default class FinalObjectIcon extends LightningElement {
    @api objectApi;
    /** Read as the icon's name; leave empty when a label sits beside it. */
    @api label = '';
    /** 'small' 16px, 'medium' 24px, 'large' 32px. */
    @api size = 'medium';

    info;

    @wire(getObjectInfo, { objectApiName: '$objectApi' })
    wiredInfo({ data }) {
        this.info = data || null;
    }

    get iconName() {
        const theme = this.info && this.info.themeInfo;
        return theme ? iconNameFromUrl(theme.iconUrl) : '';
    }

    get iconSize() {
        return SIZES[this.size] || SIZES.medium;
    }

    get hasIcon() {
        return Boolean(this.iconName);
    }

    get letter() {
        const name = (this.info && this.info.label) || this.objectApi || '?';
        return name.charAt(0).toUpperCase();
    }

    get letterClass() {
        return `oi-letter oi-${this.size === 'large' || this.size === 'small' ? this.size : 'medium'}`;
    }

    /** Salesforce's color for the object; the token grey until it loads. */
    get letterStyle() {
        const theme = this.info && this.info.themeInfo;
        return theme && /^[0-9a-f]{6}$/i.test(theme.color || '')
            ? `background-color: #${theme.color}`
            : '';
    }
}
