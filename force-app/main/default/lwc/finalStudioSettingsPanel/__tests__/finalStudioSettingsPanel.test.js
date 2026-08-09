import { createElement } from 'lwc';
import FinalStudioSettingsPanel from 'c/finalStudioSettingsPanel';

const flush = () => Promise.resolve();

const mount = (props = {}) => {
    const element = createElement('c-final-studio-settings-panel', {
        is: FinalStudioSettingsPanel
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
};

const inputByLabel = (element, label) =>
    [...element.shadowRoot.querySelectorAll('lightning-input')].find(
        (input) => input.label === label
    );

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe('studio settings panel', () => {
    it('commits normalized availability changes through one event', () => {
        const element = mount({
            section: 'availability',
            isSurvey: true,
            availability: { status: 'active' }
        });
        const listener = jest.fn();
        element.addEventListener('settingschange', listener);

        const accepting = inputByLabel(element, 'Accept responses');
        accepting.checked = false;
        accepting.dispatchEvent(new CustomEvent('change'));

        expect(listener.mock.calls[0][0].detail.availability).toMatchObject({
            status: 'closed',
            opensAt: null,
            closesAt: null,
            responseCap: null
        });
    });

    it('shows response limit only for surveys and commits a positive cap', () => {
        const formPanel = mount({
            section: 'availability',
            isSurvey: false
        });
        expect(inputByLabel(formPanel, 'Response limit')).toBeUndefined();
        document.body.removeChild(formPanel);

        const surveyPanel = mount({
            section: 'availability',
            isSurvey: true
        });
        const listener = jest.fn();
        surveyPanel.addEventListener('settingschange', listener);
        const cap = inputByLabel(surveyPanel, 'Response limit');
        cap.value = '250';
        cap.dispatchEvent(new CustomEvent('change'));
        expect(listener.mock.calls[0][0].detail.availability.responseCap).toBe(
            250
        );
    });

    it('rejects a closing time before the opening time', async () => {
        const element = mount({
            section: 'availability',
            availability: {
                status: 'active',
                opensAt: '2026-09-01T17:00:00.000Z'
            }
        });
        const listener = jest.fn();
        element.addEventListener('settingschange', listener);
        const closesAt = inputByLabel(element, 'Close at');
        closesAt.value = '2026-09-01T16:00:00.000Z';
        closesAt.dispatchEvent(new CustomEvent('change'));
        await flush();

        expect(listener).not.toHaveBeenCalled();
        expect(element.shadowRoot.querySelector('.sp-error').textContent).toBe(
            'Closing time must be later than opening time.'
        );
    });

    it('keeps the public toggle controlled and emits requested access state', () => {
        const element = mount({ section: 'access', isPublic: false });
        const listener = jest.fn();
        element.addEventListener('publicchange', listener);
        const toggle = inputByLabel(element, 'Public guest access');
        toggle.checked = true;
        toggle.dispatchEvent(new CustomEvent('change'));

        expect(listener.mock.calls[0][0].detail).toEqual({ checked: true });
        expect(toggle.checked).toBe(false);
    });

    it('keeps object and invitation actions on the access surface', async () => {
        const element = mount({
            section: 'access',
            isSurvey: true,
            objectApi: 'Contact'
        });
        await flush();
        expect(
            element.shadowRoot.querySelector('c-final-record-link-panel')
        ).not.toBeNull();
        expect(
            element.shadowRoot.querySelector('c-final-connected-object-card')
        ).toBeNull();
    });
});
