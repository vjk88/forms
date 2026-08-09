import { createElement } from 'lwc';
import FinalStudioActionDialog from 'c/finalStudioActionDialog';

const flush = () => Promise.resolve();

function mount(props = {}) {
    const element = createElement('c-final-studio-action-dialog', {
        is: FinalStudioActionDialog
    });
    Object.assign(element, props);
    document.body.appendChild(element);
    return element;
}

describe('c-final-studio-action-dialog', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('opens as a labelled modal with a useful default clone name', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        await flush();

        const dialog = element.shadowRoot.querySelector('[role="dialog"]');
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toMatch(
            /^action-title(?:-\d+)?$/
        );
        expect(input.value).toBe('Event feedback — Copy');
        expect(
            element.shadowRoot.querySelector('.action-backdrop').tabIndex
        ).toBe(-1);
    });

    it('keeps the generated default within the Salesforce name limit', () => {
        const element = mount({ sourceName: 'A'.repeat(80) });
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        expect(input.value).toHaveLength(80);
        expect(input.value.endsWith(' — Copy')).toBe(true);
        expect(
            element.shadowRoot.querySelector('[data-id="action-confirm"]')
                .disabled
        ).toBe(false);
    });

    it('keeps Close and Confirm in the focus cycle', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const close = element.shadowRoot.querySelector(
            '[data-id="action-close"]'
        );
        const confirm = element.shadowRoot.querySelector(
            '[data-id="action-confirm"]'
        );
        close.focus = jest.fn();
        confirm.focus = jest.fn();
        const sentinels =
            element.shadowRoot.querySelectorAll('.focus-sentinel');

        sentinels[0].dispatchEvent(new CustomEvent('focus'));
        sentinels[1].dispatchEvent(new CustomEvent('focus'));

        expect(confirm.focus).toHaveBeenCalledTimes(1);
        expect(close.focus).toHaveBeenCalledTimes(1);
    });

    it('moves focus to the name input when the dialog opens', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        await flush();
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.focus = jest.fn();

        element.sourceName = 'Updated feedback';
        await flush();
        await flush();

        expect(input.focus).toHaveBeenCalledTimes(1);
    });

    it('emits the trimmed clone name after local validation', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.value = '  Follow-up survey  ';
        input.dispatchEvent(new CustomEvent('change'));
        input.reportValidity = jest.fn(() => true);

        element.shadowRoot.querySelector('[data-id="action-confirm"]').click();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            name: 'Follow-up survey'
        });
    });

    it('submits the single name field with Enter', () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const input = element.shadowRoot.querySelector(
            '[data-id="clone-name"]'
        );
        input.reportValidity = jest.fn(() => true);

        input.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                composed: true
            })
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail.name).toBe(
            'Event feedback — Copy'
        );
    });

    it('cancels on Escape and keeps busy work protected', async () => {
        const element = mount({ sourceName: 'Event feedback' });
        const handler = jest.fn();
        element.addEventListener('cancel', handler);

        element.shadowRoot.querySelector('.action-shell').dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);

        element.busy = true;
        await flush();
        element.shadowRoot.querySelector('.action-shell').dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            })
        );
        expect(handler).toHaveBeenCalledTimes(1);
        expect(
            element.shadowRoot.querySelector('[data-id="action-confirm"]')
                .disabled
        ).toBe(true);
        expect(
            element.shadowRoot.querySelector('[data-id="action-confirm"]').label
        ).toBe('Cloning…');
        expect(element.shadowRoot.querySelector('[role="status"]')).not.toBe(
            null
        );
    });

    it('announces server errors without closing the dialog', () => {
        const element = mount({
            sourceName: 'Event feedback',
            error: 'The source form is unavailable.'
        });
        const alert = element.shadowRoot.querySelector('[role="alert"]');
        expect(alert.textContent).toContain('source form is unavailable');
        expect(element.shadowRoot.querySelector('[role="dialog"]')).not.toBe(
            null
        );
    });

    it('renders export asset warnings and emits a download confirmation', () => {
        const element = mount({
            action: 'export',
            exportResult: {
                fileName: 'event.finalform.json',
                packageJson: '{}',
                warnings: [
                    {
                        code: 'ASSET_BYTES_OMITTED',
                        message: 'Image bytes are not included.'
                    }
                ]
            }
        });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);

        expect(element.shadowRoot.querySelector('h2').textContent).toBe(
            'Export form'
        );
        expect(
            element.shadowRoot.querySelector('.action-warning-list').textContent
        ).toContain('Image bytes');
        element.shadowRoot.querySelector('[data-id="action-confirm"]').click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('inspects a local package and requires acceptance for server warnings', async () => {
        const element = mount({ action: 'import' });
        const inspectHandler = jest.fn();
        const confirmHandler = jest.fn();
        element.addEventListener('inspect', inspectHandler);
        element.addEventListener('confirm', confirmHandler);
        const input = element.shadowRoot.querySelector(
            '[data-id="import-file"]'
        );
        const packageJson = JSON.stringify({ kind: 'final-form-package' });
        Object.defineProperty(input, 'files', {
            value: [
                {
                    name: 'event.finalform.json',
                    size: packageJson.length,
                    text: jest.fn().mockResolvedValue(packageJson)
                }
            ]
        });
        input.dispatchEvent(new Event('change'));
        await flush();
        await flush();
        expect(inspectHandler.mock.calls[0][0].detail.packageJson).toBe(
            packageJson
        );

        element.inspection = {
            valid: true,
            name: 'Imported event',
            type: 'survey',
            pageCount: 2,
            questionCount: 5,
            warnings: [
                {
                    code: 'CREATE_SURVEY_TOPICS',
                    message: 'A topic will be created.',
                    requiresConfirmation: true
                }
            ]
        };
        await flush();
        expect(
            element.shadowRoot.querySelector('[data-id="action-confirm"]')
                .disabled
        ).toBe(true);
        const checkbox = element.shadowRoot.querySelector(
            '[data-id="warning-accept"]'
        );
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        await flush();
        element.shadowRoot.querySelector('[data-id="action-confirm"]').click();

        expect(confirmHandler.mock.calls[0][0].detail).toEqual({
            name: 'Imported event',
            packageJson,
            acceptedWarningCodes: ['CREATE_SURVEY_TOPICS']
        });
    });

    it('requires the exact name for hard deletion', async () => {
        const element = mount({
            action: 'delete',
            actionSummary: {
                formName: 'Event feedback',
                hardDeleteAllowed: true,
                versionCount: 1,
                responseCount: 0,
                invitationCount: 2,
                configFileCount: 1
            }
        });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const confirm = element.shadowRoot.querySelector(
            '[data-id="action-confirm"]'
        );
        expect(confirm.disabled).toBe(true);
        const input = element.shadowRoot.querySelector(
            '[data-id="delete-name"]'
        );
        input.value = 'Event feedback';
        input.dispatchEvent(new Event('change'));
        await flush();
        confirm.click();
        expect(handler.mock.calls[0][0].detail).toEqual({
            operation: 'delete',
            confirmationName: 'Event feedback'
        });
        expect(confirm.variant).toBe('destructive');
    });

    it('uses neutral delete preflight copy and keeps focus inside while busy', async () => {
        const element = mount({ action: 'delete', busy: true });
        await flush();
        await flush();

        const dialog = element.shadowRoot.querySelector('[role="dialog"]');
        expect(element.shadowRoot.querySelector('h2').textContent).toBe(
            'Delete form'
        );
        expect(
            element.shadowRoot.querySelector('.action-description').textContent
        ).toContain('Checking responses');
        expect(dialog.tabIndex).toBe(-1);
        expect(element.shadowRoot.activeElement).toBe(dialog);
        expect(
            element.shadowRoot.querySelector('[data-id="action-confirm"]').label
        ).toBe('Checking…');

        dialog.focus = jest.fn();
        for (const shiftKey of [false, true]) {
            dialog.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Tab',
                    shiftKey,
                    bubbles: true,
                    composed: true
                })
            );
        }
        expect(dialog.focus).toHaveBeenCalledTimes(2);
    });

    it('offers archive instead of delete when responses exist', () => {
        const element = mount({
            action: 'delete',
            actionSummary: {
                formName: 'Event feedback',
                hardDeleteAllowed: false,
                responseCount: 12
            }
        });
        const handler = jest.fn();
        element.addEventListener('confirm', handler);
        const confirm = element.shadowRoot.querySelector(
            '[data-id="action-confirm"]'
        );
        expect(confirm.label).toBe('Archive form');
        confirm.click();
        expect(handler.mock.calls[0][0].detail).toEqual({
            operation: 'archive'
        });
    });
});
