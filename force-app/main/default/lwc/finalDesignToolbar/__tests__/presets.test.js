import { createElement } from 'lwc';
import FinalDesignToolbar from 'c/finalDesignToolbar';
import { ACCENT_PRESETS } from 'c/finalDesignRegistry';

// The toolbar's Colors menu forwards accent presets (IMPL_PLAN_THEME_CATALOG_CUT P5).

const flush = () => Promise.resolve();

function mount() {
    const el = createElement('c-final-design-toolbar', {
        is: FinalDesignToolbar
    });
    el.state = {
        colorGroups: [
            {
                key: 'theme-palette',
                label: 'Theme › Palette',
                controls: [
                    {
                        key: 'accent',
                        label: 'Accent',
                        isColor: true,
                        value: '#1e3a8a',
                        presets: ACCENT_PRESETS,
                        presetBackground: '#ffffff'
                    }
                ]
            }
        ],
        searchEntries: []
    };
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

it('passes the presets to the Accent control and forwards a pick', async () => {
    const el = mount();
    const change = jest.fn();
    el.addEventListener('controlchange', change);
    el.shadowRoot.querySelector('.dt-colors-trigger').click();
    await flush();
    const accent = el.shadowRoot.querySelector(
        'c-final-color-control[data-key="accent"]'
    );
    expect(accent.presets).toHaveLength(15);
    expect(accent.presetBackground).toBe('#ffffff');
    accent.dispatchEvent(
        new CustomEvent('presetpick', { detail: { value: '#db2777' } })
    );
    expect(change.mock.calls[0][0].detail).toEqual({
        key: 'accent',
        kind: 'preset',
        value: '#db2777'
    });
});
