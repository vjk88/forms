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
        const btns = [...el.shadowRoot.querySelectorAll('.oc-btn')].map((b) =>
            b.textContent.trim()
        );
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
