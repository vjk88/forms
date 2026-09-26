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

    it('relays invitation management on its own', () => {
        const element = mount({ objectApi: 'Contact' });
        const manage = jest.fn();
        const invalidate = jest.fn();
        element.addEventListener('manageinvitations', manage);
        element.addEventListener('invalidatelinks', invalidate);

        buttonByLabel(element, 'Manage in Salesforce').click();

        expect(manage).toHaveBeenCalledTimes(1);
        expect(invalidate).not.toHaveBeenCalled();
    });

    describe('Stop earlier links asks inline, never with lightning/confirm', () => {
        const $ = (el, sel) => el.shadowRoot.querySelector(sel);
        const STOPPED =
            'Earlier links are stopped. Links you make from now on will work.';
        // The lightning-button stub has no focus(); record who was focused.
        let focused;
        beforeEach(() => {
            focused = [];
            jest.spyOn(HTMLElement.prototype, 'focus').mockImplementation(
                function record() {
                    focused.push(this);
                }
            );
        });
        afterEach(() => {
            jest.restoreAllMocks();
        });
        const lastFocused = () => focused[focused.length - 1];
        const open = async (props = {}) => {
            const el = mount({ objectApi: 'Contact', ...props });
            const invalidate = jest.fn();
            el.addEventListener('invalidatelinks', invalidate);
            await flush();
            $(el, '.rl-stop-trigger').click();
            await flush();
            return { el, invalidate };
        };

        it('shows the question with focus on Cancel, and Cancel stops nothing', async () => {
            const el = mount({ objectApi: 'Contact' });
            const invalidate = jest.fn();
            el.addEventListener('invalidatelinks', invalidate);
            const trigger = $(el, '.rl-stop-trigger');
            expect(trigger.label).toBe('Stop earlier links');
            expect(trigger.variant).toBe('destructive-text');
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
            expect($(el, '[role="alertdialog"]')).toBeNull();

            trigger.click();
            await flush();

            expect($(el, '[role="alertdialog"]')).not.toBeNull();
            expect($(el, '.rl-stop-title').textContent.trim()).toBe(
                'Stop every link made so far?'
            );
            expect($(el, '.rl-stop-text').textContent.trim()).toMatch(
                /^People who open an earlier link will no longer see/
            );
            expect(lastFocused()).toBe($(el, '.rl-stop-cancel'));
            expect(trigger.getAttribute('aria-expanded')).toBe('true');

            $(el, '.rl-stop-cancel').click();
            await flush();

            expect($(el, '[role="alertdialog"]')).toBeNull();
            expect(invalidate).not.toHaveBeenCalled();
            expect(lastFocused()).toBe(trigger);
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
        });

        it('Escape closes the question like Cancel', async () => {
            const { el, invalidate } = await open();

            $(el, '[role="alertdialog"]').dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
            );
            await flush();

            expect($(el, '[role="alertdialog"]')).toBeNull();
            expect(invalidate).not.toHaveBeenCalled();
            expect(lastFocused()).toBe($(el, '.rl-stop-trigger'));
        });

        it('Stop links asks the Studio once, shows Stopping, then hands focus back', async () => {
            const { el, invalidate } = await open();
            $(el, '.rl-stop-confirm').click();
            await flush();

            expect(invalidate).toHaveBeenCalledTimes(1);
            expect($(el, '[role="alertdialog"]')).toBeNull();

            // The Studio says it is busy stopping.
            el.linkBusy = true;
            el.linkAction = 'stop';
            await flush();
            const trigger = $(el, '.rl-stop-trigger');
            expect(trigger.label).toBe('Stopping…');
            expect(trigger.disabled).toBe(true);
            expect(
                buttonByLabel(el, 'Create invitation link')
            ).not.toBeUndefined();

            focused = [];
            el.linkBusy = false;
            el.linkAction = '';
            el.linkNotice = STOPPED;
            await flush();

            expect(trigger.label).toBe('Stop earlier links');
            expect(lastFocused()).toBe(trigger);
            expect($(el, '.rl-message[role="status"]').textContent.trim()).toBe(
                STOPPED
            );
        });

        it('a panel rebuilt mid-stop still shows Stopping and returns focus', async () => {
            const el = mount({
                objectApi: 'Contact',
                linkBusy: true,
                linkAction: 'stop'
            });
            await flush();
            const trigger = $(el, '.rl-stop-trigger');
            expect(trigger.label).toBe('Stopping…');
            expect(
                buttonByLabel(el, 'Create invitation link')
            ).not.toBeUndefined();

            el.linkBusy = false;
            el.linkAction = '';
            await flush();
            expect(lastFocused()).toBe(trigger);
        });

        it('creating a link shows Creating, never Stopping', async () => {
            const el = mount({
                objectApi: 'Contact',
                linkBusy: true,
                linkAction: 'mint'
            });
            await flush();
            const trigger = $(el, '.rl-stop-trigger');
            expect(trigger.disabled).toBe(true);
            expect(trigger.label).toBe('Stop earlier links');
            expect(
                buttonByLabel(el, 'Creating invitation…')
            ).not.toBeUndefined();
        });

        it('creating a link closes the question, and Stop links does nothing while busy', async () => {
            const { el, invalidate } = await open();
            const mint = jest.fn();
            el.addEventListener('mintlink', mint);
            const idInput = inputByLabel(el, 'Salesforce record ID');
            idInput.value = '003000000000001AAA';
            idInput.dispatchEvent(new CustomEvent('change'));
            await flush();
            buttonByLabel(el, 'Create invitation link').click();
            await flush();

            expect(mint).toHaveBeenCalledTimes(1);
            expect($(el, '[role="alertdialog"]')).toBeNull();

            // Even if the question were open while busy, confirm is inert.
            el.linkBusy = true;
            el.linkAction = 'mint';
            await flush();
            el.linkBusy = false;
            el.linkAction = '';
            await flush();
            $(el, '.rl-stop-trigger').click();
            await flush();
            el.linkBusy = true;
            await flush();
            expect($(el, '.rl-stop-confirm').disabled).toBe(true);
            $(el, '.rl-stop-confirm').click();
            expect(invalidate).not.toHaveBeenCalled();
        });

        it('hides an old result while asking, and shows a failure as an alert', async () => {
            const { el } = await open({ linkNotice: 'Old news.' });
            expect($(el, '.rl-message[role="status"]')).toBeNull();

            $(el, '.rl-stop-cancel').click();
            await flush();
            expect($(el, '.rl-message[role="status"]').textContent.trim()).toBe(
                'Old news.'
            );

            el.linkNotice = '';
            el.linkError = "Couldn't stop earlier links.";
            await flush();
            const error = $(el, '.rl-message--error');
            expect(error.getAttribute('role')).toBe('alert');
            expect(error.textContent.trim()).toBe(
                "Couldn't stop earlier links."
            );
        });
    });
});
