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
