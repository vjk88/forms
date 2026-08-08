import { createElement } from 'lwc';
import FinalConnectedObjectCard from 'c/finalConnectedObjectCard';

jest.mock(
    '@salesforce/apex/FinalFormCreateController.getUpdatableObjects',
    () => ({
        default: jest.fn(() =>
            Promise.resolve([
                { label: 'Contact', value: 'Contact' },
                { label: 'Job Application', value: 'Job_Application__c' }
            ])
        )
    }),
    { virtual: true }
);

const flush = () => new Promise((r) => setTimeout(r, 0));

const mount = (props = {}) => {
    const el = createElement('c-final-connected-object-card', {
        is: FinalConnectedObjectCard
    });
    Object.assign(el, props);
    document.body.appendChild(el);
    return el;
};

const text = (el, sel) => {
    const n = el.shadowRoot.querySelector(sel);
    return n ? n.textContent.trim() : null;
};

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('connected object card (SO-1)', () => {
    it('empty state offers Connect and explains the unlock', () => {
        const el = mount();
        expect(text(el, '.oc-primary')).toBe('Connect object…');
        expect(text(el, '.oc-sub')).toContain('No object connected');
    });

    it('connected state shows the object and mapped count', () => {
        const el = mount({ objectApi: 'Contact', mappedCount: 3 });
        expect(text(el, '.oc-title')).toBe('Contact');
        expect(text(el, '.oc-sub')).toBe('3 questions mapped');
        const btns = [
            ...el.shadowRoot.querySelectorAll('.oc-actions .oc-btn')
        ].map((b) => b.textContent.trim());
        expect(btns).toEqual(['Change…', 'Disconnect']);
    });

    it('picking an object emits objectpick with its API name', async () => {
        const el = mount();
        const seen = [];
        el.addEventListener('objectpick', (e) => seen.push(e.detail));
        el.shadowRoot.querySelector('.oc-primary').click();
        await flush();
        await flush();
        const rows = el.shadowRoot.querySelectorAll('.oc-obj');
        expect(rows.length).toBe(2);
        rows[1].click();
        expect(seen).toEqual([{ objectApi: 'Job_Application__c' }]);
    });

    it('SO-4: Create link emits mintlink with the typed record Id', async () => {
        const el = mount({ objectApi: 'Job_Application__c', mappedCount: 1 });
        const seen = [];
        el.addEventListener('mintlink', (e) => seen.push(e.detail));
        const input = el.shadowRoot.querySelector('.oc-linkrow .oc-search');
        input.value = 'a01000000000001AAA';
        input.dispatchEvent(new CustomEvent('input'));
        await flush(); // let the button un-disable before we click it
        el.shadowRoot.querySelector('.oc-links .oc-primary').click();
        expect(seen).toEqual([
            {
                recordId: 'a01000000000001AAA',
                tracked: false,
                recipient: '',
                singleUse: false
            }
        ]);
    });

    it('SO-4 Tier 2: tracked toggle reveals recipient + single-use and mints tracked', async () => {
        const el = mount({ objectApi: 'Job_Application__c', mappedCount: 1 });
        const seen = [];
        el.addEventListener('mintlink', (e) => seen.push(e.detail));
        // turn on tracking
        const trackToggle = el.shadowRoot.querySelector('.oc-check input');
        trackToggle.checked = true;
        trackToggle.dispatchEvent(new CustomEvent('change'));
        await flush();
        // recipient + single-use now present
        const recipInput = el.shadowRoot.querySelector(
            'input[aria-label="Invitation label (optional)"]'
        );
        expect(recipInput).not.toBeNull();
        recipInput.value = 'ada@example.com';
        recipInput.dispatchEvent(new CustomEvent('input'));
        const checks = el.shadowRoot.querySelectorAll('.oc-check input');
        checks[1].checked = true; // single use
        checks[1].dispatchEvent(new CustomEvent('change'));
        // create
        const idInput = el.shadowRoot.querySelector('.oc-linkrow .oc-search');
        idInput.value = 'a01000000000001AAA';
        idInput.dispatchEvent(new CustomEvent('input'));
        await flush();
        el.shadowRoot.querySelector('.oc-links .oc-primary').click();
        expect(seen).toEqual([
            {
                recordId: 'a01000000000001AAA',
                tracked: true,
                recipient: 'ada@example.com',
                singleUse: true
            }
        ]);
    });

    it('SO-4: Create link stays disabled until the Id looks valid', () => {
        const el = mount({ objectApi: 'Job_Application__c' });
        const btn = el.shadowRoot.querySelector('.oc-links .oc-primary');
        expect(btn.disabled).toBe(true);
        const input = el.shadowRoot.querySelector('.oc-linkrow .oc-search');
        input.value = 'a01000000000001AAA';
        input.dispatchEvent(new CustomEvent('input'));
        return Promise.resolve().then(() => {
            expect(
                el.shadowRoot.querySelector('.oc-links .oc-primary').disabled
            ).toBe(false);
        });
    });

    it('SO-4: a minted link is shown read-only and Invalidate relays its event', () => {
        const el = mount({
            objectApi: 'Job_Application__c',
            mintedLink: '?c__formId=a0X&c__rt=TOKEN'
        });
        const out = el.shadowRoot.querySelector('.oc-linkout');
        expect(out).not.toBeNull();
        expect(out.value).toBe('?c__formId=a0X&c__rt=TOKEN');
        const seen = [];
        el.addEventListener('invalidatelinks', () => seen.push('x'));
        [...el.shadowRoot.querySelectorAll('.oc-links .oc-quiet')]
            .find((b) => b.textContent.trim() === 'Invalidate all links')
            .click();
        expect(seen).toEqual(['x']);
    });

    it('SO-4 Tier 2: a completed mint clears the recipient (no cross-record mislabel)', async () => {
        const el = mount({ objectApi: 'Job_Application__c' });
        const track = el.shadowRoot.querySelector('.oc-check input');
        track.checked = true;
        track.dispatchEvent(new CustomEvent('change'));
        await flush();
        const recip = el.shadowRoot.querySelector(
            'input[aria-label="Invitation label (optional)"]'
        );
        recip.value = 'jane@acme.com';
        recip.dispatchEvent(new CustomEvent('input'));
        // a minted link arrives from the studio
        el.mintedLink = '?c__formId=a0X&c__rt=TOK';
        await flush();
        expect(
            el.shadowRoot.querySelector(
                'input[aria-label="Invitation label (optional)"]'
            ).value
        ).toBe('');
    });

    it('pending state lists casualties and relays confirm/cancel', () => {
        const el = mount({
            objectApi: 'Contact',
            pending: {
                objectApi: 'Lead',
                casualties: ['NPS → Score__c'],
                survivors: 2
            }
        });
        const seen = [];
        el.addEventListener('objectconfirm', () => seen.push('confirm'));
        expect(text(el, '.oc-title')).toContain('Lead');
        expect(text(el, '.oc-list li')).toBe('NPS → Score__c');
        expect(text(el, '.oc-sub')).toContain('2 compatible mappings');
        el.shadowRoot.querySelector('.oc-danger').click();
        expect(seen).toEqual(['confirm']);
    });
});
