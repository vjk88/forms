import {
    buildScreens,
    clampIndex,
    isLastScreen,
    shouldAdvanceOnKey,
    isMultilineTarget,
    fromElementRenderer,
    resolveAdvanceOrigin
} from 'c/finalStepFlow';

const enter = (mods = {}) => ({
    key: 'Enter',
    ctrlKey: false,
    metaKey: false,
    ...mods
});

describe('shouldAdvanceOnKey', () => {
    it('advances from a single-line text input', () => {
        const target = { tagName: 'INPUT', type: 'text' };
        expect(shouldAdvanceOnKey(enter(), target)).toBe(true);
    });

    it('ignores non-Enter keys and missing targets', () => {
        const target = { tagName: 'INPUT', type: 'text' };
        expect(shouldAdvanceOnKey({ key: 'a' }, target)).toBe(false);
        expect(shouldAdvanceOnKey(enter(), null)).toBe(false);
        expect(shouldAdvanceOnKey(enter(), {})).toBe(false);
    });

    it('NEVER advances from a button — Enter is its native activation (Back link, choice chips)', () => {
        // <button> with no type attribute reports type "submit" in the DOM
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'BUTTON', type: 'submit' })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'BUTTON', type: 'button' })
        ).toBe(false);
        // role="radio" chips are still <button> tags — role never changes .type
        expect(
            shouldAdvanceOnKey(enter(), {
                tagName: 'BUTTON',
                type: 'submit',
                role: 'radio'
            })
        ).toBe(false);
    });

    it('never advances from links or input-typed buttons', () => {
        expect(shouldAdvanceOnKey(enter(), { tagName: 'A' })).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'INPUT', type: 'button' })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'INPUT', type: 'submit' })
        ).toBe(false);
    });

    it('never advances from choice inputs', () => {
        expect(shouldAdvanceOnKey(enter(), { tagName: 'SELECT' })).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'INPUT', type: 'radio' })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'INPUT', type: 'checkbox' })
        ).toBe(false);
    });

    it('multiline targets need Ctrl/Cmd+Enter', () => {
        const area = { tagName: 'TEXTAREA' };
        expect(shouldAdvanceOnKey(enter(), area)).toBe(false);
        expect(shouldAdvanceOnKey(enter({ ctrlKey: true }), area)).toBe(true);
        expect(shouldAdvanceOnKey(enter({ metaKey: true }), area)).toBe(true);

        const rich = { tagName: 'DIV', isContentEditable: true };
        expect(shouldAdvanceOnKey(enter(), rich)).toBe(false);
        expect(shouldAdvanceOnKey(enter({ ctrlKey: true }), rich)).toBe(true);
    });

    it('custom-element hosts: lightning-input advances, multiline hosts need Ctrl, anything else never hijacks', () => {
        // LWS retargets cross-boundary origins to the child HOST — only the
        // lightning input trio is decidable from a host tag
        expect(
            shouldAdvanceOnKey(enter(), {
                tagName: 'LIGHTNING-INPUT',
                type: 'text'
            })
        ).toBe(true);
        expect(
            shouldAdvanceOnKey(enter(), {
                tagName: 'LIGHTNING-INPUT',
                type: 'checkbox'
            })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'LIGHTNING-TEXTAREA' })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter({ ctrlKey: true }), {
                tagName: 'LIGHTNING-TEXTAREA'
            })
        ).toBe(true);
        expect(
            shouldAdvanceOnKey(enter(), {
                tagName: 'LIGHTNING-INPUT-RICH-TEXT'
            })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter({ metaKey: true }), {
                tagName: 'LIGHTNING-INPUT-RICH-TEXT'
            })
        ).toBe(true);
        // opaque hosts: the org QA bug — chip Enter arrived as the renderer
        // host and advanced without selecting. Never hijack on a guess.
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'C-FINAL-ELEMENT-RENDERER' })
        ).toBe(false);
        expect(
            shouldAdvanceOnKey(enter(), { tagName: 'LIGHTNING-COMBOBOX' })
        ).toBe(false);
    });

    it('plain Enter only for single-line inputs — modifiers do not advance', () => {
        const target = { tagName: 'INPUT', type: 'text' };
        expect(shouldAdvanceOnKey(enter({ ctrlKey: true }), target)).toBe(
            false
        );
        expect(shouldAdvanceOnKey(enter({ metaKey: true }), target)).toBe(
            false
        );
    });
});

describe('isMultilineTarget', () => {
    it('detects textarea, contenteditable, and lightning multiline hosts', () => {
        expect(isMultilineTarget({ tagName: 'TEXTAREA' })).toBe(true);
        expect(
            isMultilineTarget({ tagName: 'DIV', isContentEditable: true })
        ).toBe(true);
        expect(isMultilineTarget({ tagName: 'LIGHTNING-TEXTAREA' })).toBe(true);
        expect(
            isMultilineTarget({ tagName: 'LIGHTNING-INPUT-RICH-TEXT' })
        ).toBe(true);
        expect(isMultilineTarget({ tagName: 'INPUT', type: 'text' })).toBe(
            false
        );
        expect(isMultilineTarget({ tagName: 'LIGHTNING-INPUT' })).toBe(false);
        expect(isMultilineTarget(null)).toBe(false);
    });
});

describe('resolveAdvanceOrigin', () => {
    it('walks past lightning primitive wrappers to the decidable host', () => {
        // org shape: input Enter surfaces as the primitive host, with the
        // real lightning-input one hop up the path
        const path = [
            { tagName: 'LIGHTNING-PRIMITIVE-INPUT-SIMPLE' },
            {}, // shadow root — no tagName
            { tagName: 'LIGHTNING-INPUT', type: 'text' },
            { tagName: 'C-FINAL-ELEMENT-RENDERER' }
        ];
        expect(resolveAdvanceOrigin(path, null).tagName).toBe(
            'LIGHTNING-INPUT'
        );
    });

    it('native controls decide immediately — a chip button never walks past itself', () => {
        const path = [
            { tagName: 'BUTTON', type: 'submit' },
            { tagName: 'DIV' },
            { tagName: 'LIGHTNING-INPUT' }
        ];
        expect(resolveAdvanceOrigin(path, null).tagName).toBe('BUTTON');
    });

    it('skips wrapper noise (div/span) and falls back when nothing is decidable', () => {
        const fallback = { tagName: 'C-HOST' };
        expect(
            resolveAdvanceOrigin(
                [{ tagName: 'DIV' }, { tagName: 'SPAN' }],
                fallback
            )
        ).toBe(fallback);
        expect(resolveAdvanceOrigin(null, fallback)).toBe(fallback);
        const rich = { tagName: 'DIV', isContentEditable: true };
        expect(resolveAdvanceOrigin([rich], null)).toBe(rich);
    });
});

describe('fromElementRenderer', () => {
    it('detects the renderer host anywhere on the composed path', () => {
        expect(
            fromElementRenderer([
                { tagName: 'INPUT' },
                { tagName: 'C-FINAL-ELEMENT-RENDERER' },
                { tagName: 'DIV' }
            ])
        ).toBe(true);
        expect(
            fromElementRenderer([{ tagName: 'BUTTON' }, { tagName: 'DIV' }])
        ).toBe(false);
        expect(fromElementRenderer([])).toBe(false);
        expect(fromElementRenderer(null)).toBe(false);
    });
});

describe('buildScreens / clampIndex / isLastScreen', () => {
    const pages = [
        { id: 'p1', sections: [{ id: 's1' }, { id: 's2' }] },
        { id: 'p2', sections: [{ id: 's3' }] }
    ];

    it('flattens pages into ordered screens', () => {
        const screens = buildScreens(pages);
        expect(screens.map((s) => s.key)).toEqual(['s1', 's2', 's3']);
        expect(screens[2].pageIndex).toBe(1);
    });

    it('clamps navigation to valid indexes', () => {
        const screens = buildScreens(pages);
        expect(clampIndex(-1, screens)).toBe(0);
        expect(clampIndex(99, screens)).toBe(2);
        expect(isLastScreen(2, screens)).toBe(true);
        expect(isLastScreen(1, screens)).toBe(false);
    });
});
