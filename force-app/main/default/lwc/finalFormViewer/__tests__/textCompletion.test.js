import { createElement } from 'lwc';
import FinalFormViewer from 'c/finalFormViewer';
import submitForm from '@salesforce/apex/FinalSubmitController.submitForm';
import getSpecEnvelope from '@salesforce/apex/FinalSpecController.getSpecEnvelope';
import { resolveTokens } from 'c/finalThemeEngine';
import { getBuiltinTheme } from 'c/finalThemeCatalog';
import BEFORE from '../../finalThemeCatalog/__tests__/__fixtures__/tokensBeforeTextContrast.json';

// IMPL_PLAN_TEXT_CONTRAST v7 §4.7 (PR B): on the One at a time open page the
// page's colours are swapped in while the questions show; the completion
// screen draws a CARD, so after a real submit the frame carries the card's
// colours again. An old snapshot keeps today's behaviour.

jest.mock(
    '@salesforce/apex/FinalSubmitController.submitForm',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/FinalSpecController.getSpecEnvelope',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const SPEC = (theme, resolved) => ({
    specVersion: 1,
    form: { name: 'Pulse', type: 'survey' },
    layout: { type: 'oneAtATime', options: {} },
    header: { style: 'none' },
    theme,
    settings: { completion: { mode: 'screen' } },
    submit: { label: 'Send' },
    pages: [
        {
            id: 'pg_1',
            name: 'One',
            sections: [
                {
                    id: 'sec_1',
                    title: 'S',
                    columns: 1,
                    elements: [
                        {
                            id: 'el_a',
                            type: 'field',
                            label: 'A',
                            render: { inputType: 'text' }
                        }
                    ]
                }
            ]
        }
    ],
    ...(resolved ? { resolved } : {})
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function submitAndRead(spec) {
    getSpecEnvelope.mockResolvedValue({
        versionId: 'a0Vserved',
        spec: JSON.stringify(spec)
    });
    submitForm.mockResolvedValue({ recordId: '003X', childCount: 0 });
    const el = createElement('c-final-form-viewer', { is: FinalFormViewer });
    el.versionId = 'a0Vx';
    document.body.appendChild(el);
    await flush();
    await flush();
    const frame = el.shadowRoot.querySelector('c-final-page-frame');
    const before = { ...frame.tokens };
    const nav = frame.querySelector('x-test');
    nav.dispatchEvent(new CustomEvent('submit'));
    // wait for the thank-you screen itself, not a fixed number of ticks
    // (a busy parallel run can need more; PR 409 review)
    for (
        let i = 0;
        i < 50 && !el.shadowRoot.querySelector('c-final-after-submit');
        i += 1
    ) {
        // eslint-disable-next-line no-await-in-loop
        await flush();
    }
    await flush();
    return {
        before,
        after: { ...frame.tokens },
        thankYou: el.shadowRoot.querySelector('c-final-after-submit')
    };
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
});

describe('completion after a One at a time submit', () => {
    it.each([
        ['cosmicVortex', { palette: { contentBgOpacity: 94 } }],
        ['neonNights', {}]
    ])(
        '%s: the thank-you card gets the card colours back',
        async (key, overrides) => {
            const theme = { source: 'builtin', name: key, overrides };
            const tokens = resolveTokens(getBuiltinTheme(key), overrides);
            const { before, after, thankYou } = await submitAndRead(
                SPEC(theme)
            );
            expect(thankYou).not.toBeNull();
            // while the questions show: the page's own colours
            expect(before['--c-text-weak']).toBe(tokens['--c-text-weak-page']);
            expect(before['--c-text-under']).toBe(
                tokens['--c-text-under-page']
            );
            // on the thank-you card: the card's colours, focus included
            expect(after['--c-text-weak']).toBe(tokens['--c-text-weak']);
            expect(after['--c-text-under']).toBe(tokens['--c-text-under']);
            expect(after['--c-focus-ring']).toBe(tokens['--c-focus-ring']);
            // Neon's card backing returns; Cosmic's card has none
            expect(after['--c-card-backing']).toBe(tokens['--c-card-backing']);
        }
    );

    it('an old snapshot keeps its page swap through completion, as today', async () => {
        const old = BEFORE.themes.cosmicVortex;
        const { before, after } = await submitAndRead(
            SPEC(
                { source: 'builtin', name: 'cosmicVortex', overrides: {} },
                {
                    tokens: old,
                    engineVersion: 1,
                    resolvedAt: '2026-10-25T00:00:00Z'
                }
            )
        );
        expect(after).toEqual(before);
        expect(after['--c-text-treatment']).toBeUndefined();
    });
});
