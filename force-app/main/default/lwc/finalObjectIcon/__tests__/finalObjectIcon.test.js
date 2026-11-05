import { createElement } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import FinalObjectIcon, { iconNameFromUrl } from 'c/finalObjectIcon';

function mount(props) {
    const el = createElement('c-final-object-icon', { is: FinalObjectIcon });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('iconNameFromUrl', () => {
    it('turns a standard icon address into its name', () => {
        expect(
            iconNameFromUrl(
                'https://x.my.salesforce.com/img/icon/t4v35/standard/account_120.png'
            )
        ).toBe('standard:account');
    });

    it('turns a custom tab style into its name', () => {
        expect(iconNameFromUrl('/img/icon/t4v35/custom/custom57_120.png')).toBe(
            'custom:custom57'
        );
    });

    it('gives nothing for an object without an icon', () => {
        expect(iconNameFromUrl(null)).toBe('');
        expect(iconNameFromUrl('/img/somethingelse.gif')).toBe('');
    });
});

describe('c-final-object-icon', () => {
    it('draws the Salesforce icon once the object info arrives', async () => {
        const el = mount({ objectApi: 'Account', label: 'Account' });
        getObjectInfo.emit({
            label: 'Account',
            themeInfo: {
                color: '5867E8',
                iconUrl: '/img/icon/t4v35/standard/account_120.png'
            }
        });
        await Promise.resolve();
        const icon = el.shadowRoot.querySelector('lightning-icon');
        expect(icon.iconName).toBe('standard:account');
        expect(icon.alternativeText).toBe('Account');
    });

    it('shows the first letter on the object color when it has no tab', async () => {
        const el = mount({ objectApi: 'Job_Application__c', size: 'large' });
        getObjectInfo.emit({
            label: 'Job Application',
            themeInfo: { color: '747E96', iconUrl: null }
        });
        await Promise.resolve();
        expect(el.shadowRoot.querySelector('lightning-icon')).toBeNull();
        const letter = el.shadowRoot.querySelector('.oi-letter');
        expect(letter.textContent).toBe('J');
        expect(letter.className).toContain('oi-large');
        expect(letter.getAttribute('style')).toContain('#747E96');
    });
});
