import { resolveTokens } from 'c/finalThemeEngine';

describe('backdrop composition (gradients + image opacity)', () => {
    it('no gradient config → all three gradient tokens are none', () => {
        const t = resolveTokens({ palette: { pageBg: '#ffffff' } });
        expect(t['--c-page-bg-gradient']).toBe('none');
        expect(t['--c-content-bg-gradient']).toBe('none');
        expect(t['--c-header-bg-gradient']).toBe('none');
        expect(t['--c-page-veil']).toBe('none');
    });

    it('linear gradient composes angle + stops; radial ignores angle', () => {
        const t = resolveTokens(null, {
            palette: {
                pageBgGradient: {
                    type: 'linear',
                    angle: 160,
                    start: '#059669',
                    end: '#064e3b'
                },
                contentBgGradient: {
                    type: 'radial',
                    angle: 45,
                    start: '#38bdf8',
                    end: '#1d4ed8'
                }
            }
        });
        expect(t['--c-page-bg-gradient']).toBe(
            'linear-gradient(160deg, #059669, #064e3b)'
        );
        expect(t['--c-content-bg-gradient']).toBe(
            'radial-gradient(circle at 50% 0%, #38bdf8, #1d4ed8)'
        );
    });

    it('incomplete gradients degrade to none, never invalid CSS', () => {
        const t = resolveTokens(null, {
            palette: { headerBgGradient: { type: 'linear', start: '#fff' } }
        });
        expect(t['--c-header-bg-gradient']).toBe('none');
    });

    it('image opacity 40 → a 0.6-alpha pageBg-tinted veil; no image → none', () => {
        const t = resolveTokens(null, {
            palette: { pageBg: '#112233' },
            pageImage: { url: 'https://x/i.png', opacity: 40 }
        });
        expect(t['--c-page-veil']).toBe(
            'linear-gradient(rgba(17, 34, 51, 0.6), rgba(17, 34, 51, 0.6))'
        );
        const noImg = resolveTokens(null, {
            palette: { pageBg: '#112233' },
            pageImage: { opacity: 40 }
        });
        expect(noImg['--c-page-veil']).toBe('none');
    });

    it('full-opacity image keeps the veil off (back-compat)', () => {
        const t = resolveTokens(null, {
            pageImage: { url: 'https://x/i.png' }
        });
        expect(t['--c-page-veil']).toBe('none');
    });
});

describe('fill opacity (translucent surface colors)', () => {
    it('wraps each surface fill in color-mix at its own opacity', () => {
        const t = resolveTokens(null, {
            palette: {
                pageBg: '#f6f4ee',
                contentBg: '#ffffff',
                headerBg: '#0f766e',
                pageBgOpacity: 80,
                contentBgOpacity: 55,
                headerBgOpacity: 30
            }
        });
        expect(t['--c-page-bg']).toBe(
            'color-mix(in srgb, #f6f4ee 80%, transparent)'
        );
        expect(t['--c-content-bg']).toBe(
            'color-mix(in srgb, #ffffff 55%, transparent)'
        );
        expect(t['--c-header-bg']).toBe(
            'color-mix(in srgb, #0f766e 30%, transparent)'
        );
    });

    it('100 or unset passes the raw color through (back-compat)', () => {
        const t = resolveTokens(null, {
            palette: { contentBg: '#ffffff', contentBgOpacity: 100 }
        });
        expect(t['--c-content-bg']).toBe('#ffffff');
        const untouched = resolveTokens(null, {
            palette: { contentBg: '#ffffff' }
        });
        expect(untouched['--c-content-bg']).toBe('#ffffff');
    });

    it('gradient stops inherit the surface fill opacity', () => {
        const t = resolveTokens(null, {
            palette: {
                contentBgOpacity: 40,
                contentBgGradient: {
                    type: 'linear',
                    angle: 90,
                    start: '#38bdf8',
                    end: '#1d4ed8'
                }
            }
        });
        expect(t['--c-content-bg-gradient']).toBe(
            'linear-gradient(90deg, color-mix(in srgb, #38bdf8 40%, transparent), color-mix(in srgb, #1d4ed8 40%, transparent))'
        );
    });

    it('ink derivation still reads the RAW fill (veil unaffected)', () => {
        const t = resolveTokens(null, {
            palette: { pageBg: '#112233', pageBgOpacity: 50 },
            pageImage: { url: 'https://x/i.png', opacity: 40 }
        });
        expect(t['--c-page-veil']).toBe(
            'linear-gradient(rgba(17, 34, 51, 0.6), rgba(17, 34, 51, 0.6))'
        );
    });
});
