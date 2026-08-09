import { createElement } from 'lwc';
import FinalRecordLinkPanel from 'c/finalRecordLinkPanel';

const flush = () => Promise.resolve();

const mount = (props = {}) => {
    const element = createElement('c-final-record-link-panel', {
        is: FinalRecordLinkPanel
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
};

const inputByLabel = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-input')].find(
        (input) => input.label === label
    );

const buttonByLabel = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-button')].find(
        (button) => button.label === label
    );

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('record invitation panel', () => {
    it('requires a Salesforce ID and emits an untracked invitation request', async () => {
        const element = mount({ objectApi: 'Contact' });
        const listener = jest.fn();
        element.addEventListener('mintlink', listener);
        expect(buttonByLabel(element, 'Create invitation link').disabled).toBe(
            true
        );

        const idInput = inputByLabel(element, 'Salesforce record ID');
        idInput.value = '003000000000001AAA';
        idInput.dispatchEvent(new CustomEvent('change'));
        await flush();
        buttonByLabel(element, 'Create invitation link').click();

        expect(listener.mock.calls[0][0].detail).toEqual({
            recordId: '003000000000001AAA',
            tracked: false,
            recipient: '',
            singleUse: false
        });
    });

    it('includes tracking options and clears per-invitation fields after mint', async () => {
        const element = mount({ objectApi: 'Contact' });
        const tracked = inputByLabel(element, 'Track this invitation');
        tracked.checked = true;
        tracked.dispatchEvent(new CustomEvent('change'));
        await flush();

        const label = inputByLabel(element, 'Invitation label');
        label.value = 'ada@example.com';
        label.dispatchEvent(new CustomEvent('change'));
        const singleUse = inputByLabel(
            element,
            'Stop working after one response'
        );
        singleUse.checked = true;
        singleUse.dispatchEvent(new CustomEvent('change'));

        element.mintedLink = '?c__formId=a0X&c__rt=TOKEN';
        await flush();
        expect(element.shadowRoot.querySelector('.rl-link-output').value).toBe(
            '?c__formId=a0X&c__rt=TOKEN'
        );

        const listener = jest.fn();
        element.addEventListener('mintlink', listener);
        const idInput = inputByLabel(element, 'Salesforce record ID');
        idInput.value = '003000000000002AAA';
        idInput.dispatchEvent(new CustomEvent('change'));
        await flush();
        buttonByLabel(element, 'Create invitation link').click();
        expect(listener.mock.calls[0][0].detail.recipient).toBe('');
    });

    it('relays invitation management and invalidation separately', () => {
        const element = mount({ objectApi: 'Contact' });
        const manage = jest.fn();
        const invalidate = jest.fn();
        element.addEventListener('manageinvitations', manage);
        element.addEventListener('invalidatelinks', invalidate);

        buttonByLabel(element, 'Manage in Salesforce').click();
        buttonByLabel(element, 'Invalidate all invitation links').click();

        expect(manage).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledTimes(1);
    });
});
