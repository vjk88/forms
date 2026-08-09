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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const mount = (props = {}) => {
    const element = createElement('c-final-connected-object-card', {
        is: FinalConnectedObjectCard
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
};

const buttonByLabel = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        (button) => button.label === label
    );

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('connected object editor', () => {
    it('offers a focused connect action in the empty state', () => {
        const element = mount();
        expect(element.shadowRoot.querySelector('.oc-title').textContent).toBe(
            'No object connected'
        );
        expect(buttonByLabel(element, 'Connect object')).toBeDefined();
        expect(element.shadowRoot.querySelector('.rl-panel')).toBeNull();
    });

    it('shows the connected object and mapped count', () => {
        const element = mount({ objectApi: 'Contact', mappedCount: 3 });
        expect(element.shadowRoot.querySelector('.oc-title').textContent).toBe(
            'Contact'
        );
        expect(element.shadowRoot.querySelector('.oc-help').textContent).toBe(
            '3 questions mapped'
        );
        expect(buttonByLabel(element, 'Change object')).toBeDefined();
        expect(buttonByLabel(element, 'Disconnect')).toBeDefined();
    });

    it('loads the picker and emits the selected object API name', async () => {
        const element = mount();
        const listener = jest.fn();
        element.addEventListener('objectpick', listener);

        buttonByLabel(element, 'Connect object').click();
        await flush();
        await flush();
        const rows = element.shadowRoot.querySelectorAll('.oc-object');
        expect(rows).toHaveLength(2);
        rows[1].click();

        expect(listener.mock.calls[0][0].detail).toEqual({
            objectApi: 'Job_Application__c'
        });
    });

    it('lists mapping casualties and relays confirmation', () => {
        const element = mount({
            objectApi: 'Contact',
            pending: {
                objectApi: 'Lead',
                casualties: ['NPS → Score__c'],
                survivors: 2
            }
        });
        const listener = jest.fn();
        element.addEventListener('objectconfirm', listener);

        expect(
            element.shadowRoot.querySelector('.oc-title').textContent
        ).toContain('Lead');
        expect(
            element.shadowRoot.querySelector('.oc-list li').textContent
        ).toBe('NPS → Score__c');
        expect(
            element.shadowRoot.querySelector('.oc-help').textContent
        ).toContain('2 compatible mappings');
        buttonByLabel(element, 'Change anyway').click();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
