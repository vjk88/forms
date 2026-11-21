import {
    sha256Hex,
    leadingZeroBits,
    isValidProof,
    ticketDifficulty,
    solve,
    solveTicket
} from 'c/finalProofOfWork';

const nodeCrypto = require('crypto');

const nodeSha = (text) =>
    nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function setHidden(value) {
    Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => value
    });
}

afterEach(() => {
    setHidden(false);
    jest.restoreAllMocks();
});

// The SAME vectors FinalGuestTicketTest (Apex) asserts, so the browser and
// the server provably agree on the digest.
describe('sha256Hex: shared vectors with Apex', () => {
    it.each([
        [
            '',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        ],
        [
            'abc',
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        ],
        [
            'héllo ✓ ü',
            '0744a0e18b7c0109a88b05b3094d6ec9ebec3b19a5b787354238c0e0732937ba'
        ],
        [
            'a'.repeat(1000),
            '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'
        ],
        [
            'vector-ticket:1412',
            '000ed27eb7d5ccbbac8e311bbbe82b0c526e1d4035553218f8a8db008f07fd39'
        ],
        [
            'vector-ticket:773',
            '00d4a14f76f5eaa9688a5536361bc3986bad94a723f0bdb0e1f5ad314b5886ad'
        ]
    ])('hashes %j', (input, expected) => {
        expect(sha256Hex(input)).toBe(expected);
    });

    it('agrees with Node for every length across the block boundaries', () => {
        for (let n = 0; n <= 300; n++) {
            const text = 'x'.repeat(n);
            expect(sha256Hex(text)).toBe(nodeSha(text));
        }
    });

    it('hashes non-ASCII text as UTF-8 like Node does', () => {
        const samples = ['éèê', '✓✔✕ mixed 123', '日本語', 'astral 😀 pair'];
        samples.forEach((s) => expect(sha256Hex(s)).toBe(nodeSha(s)));
    });
});

describe('leadingZeroBits', () => {
    it('counts bits across the nibble and byte boundaries', () => {
        expect(leadingZeroBits('80ff')).toBe(0);
        expect(leadingZeroBits('40ff')).toBe(1);
        expect(leadingZeroBits('10ff')).toBe(3);
        expect(leadingZeroBits('01ff')).toBe(7);
        expect(leadingZeroBits('00d4')).toBe(8);
        expect(leadingZeroBits('000e')).toBe(12);
        expect(leadingZeroBits('007f')).toBe(9);
    });

    it('checks the shared vectors (8 bits and 12 bits)', () => {
        expect(leadingZeroBits(sha256Hex('vector-ticket:773'))).toBe(8);
        expect(leadingZeroBits(sha256Hex('vector-ticket:1412'))).toBe(12);
    });
});

describe('ticketDifficulty', () => {
    const b64url = (s) =>
        Buffer.from(s, 'utf8')
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

    it('reads the signed difficulty out of the payload', () => {
        const ticket =
            b64url('v1|a05hk0000028WzFAAU|1700000000000|abcd|17') + '.sig';
        expect(ticketDifficulty(ticket)).toBe(17);
    });

    it('returns null for anything unreadable or out of range', () => {
        expect(ticketDifficulty('nonsense')).toBeNull();
        expect(ticketDifficulty('')).toBeNull();
        expect(ticketDifficulty(undefined)).toBeNull();
        expect(ticketDifficulty(b64url('v1|a|b|c') + '.s')).toBeNull();
        expect(ticketDifficulty(b64url('v1|a|1|c|99') + '.s')).toBeNull();
        expect(ticketDifficulty(b64url('v1|a|1|c|x') + '.s')).toBeNull();
    });
});

describe('solve', () => {
    it('finds the first nonce, matching the shared 12-bit vector', async () => {
        await expect(solve('vector-ticket', 12)).resolves.toBe('1412');
    });

    it('finds the shared 8-bit vector', async () => {
        await expect(solve('vector-ticket', 8)).resolves.toBe('773');
    });

    it('solves difficulty 0 at once with "0"', async () => {
        await expect(solve('anything', 0)).resolves.toBe('0');
    });

    it('returns a nonce Node agrees is valid, across digit-count changes', async () => {
        for (const ticket of ['t-one', 't-two', 'a'.repeat(190)]) {
            // eslint-disable-next-line no-await-in-loop
            const nonce = await solve(ticket, 11);
            expect(nonce).toMatch(/^(0|[1-9][0-9]*)$/);
            expect(
                leadingZeroBits(nodeSha(`${ticket}:${nonce}`))
            ).toBeGreaterThanOrEqual(11);
            expect(isValidProof(ticket, nonce, 11)).toBe(true);
            // and it is the FIRST one: nothing smaller works
            for (let n = 0; n < Number(nonce); n++) {
                expect(leadingZeroBits(nodeSha(`${ticket}:${n}`))).toBeLessThan(
                    11
                );
            }
        }
    });

    it('yields to the page between slices', async () => {
        const spy = jest.spyOn(global, 'setTimeout');
        // sliceMs 0: every slice does the minimum, so a long search must
        // hand control back many times
        await solve('vector-ticket', 12, { sliceMs: 0 });
        const yields = spy.mock.calls.filter((c) => c[1] === 0).length;
        expect(yields).toBeGreaterThan(5);
    });

    it('rejects with AbortError as soon as it is cancelled', async () => {
        const controller = new AbortController();
        const pending = solve('never-solved', 32, {
            signal: controller.signal
        });
        await tick(20);
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects at once when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            solve('x', 12, { signal: controller.signal })
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('stops working after an abort (no timers left running)', async () => {
        const controller = new AbortController();
        const pending = solve('never-solved', 32, {
            signal: controller.signal
        });
        pending.catch(() => {});
        controller.abort();
        await tick(5);
        const spy = jest.spyOn(global, 'setTimeout');
        await tick(30);
        // only the test's own tick(30) timer, none from the solver
        expect(spy.mock.calls.length).toBe(1);
    });

    it('pauses while the tab is hidden and resumes when it is visible', async () => {
        setHidden(true);
        let done = false;
        const pending = solve('vector-ticket', 12).then((n) => {
            done = true;
            return n;
        });
        await tick(60);
        expect(done).toBe(false);

        setHidden(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await expect(pending).resolves.toBe('1412');
    });

    it('does not resume on a visibilitychange that is still hidden', async () => {
        setHidden(true);
        let done = false;
        solve('vector-ticket', 12).then(() => {
            done = true;
        });
        await tick(20);
        document.dispatchEvent(new Event('visibilitychange'));
        await tick(40);
        expect(done).toBe(false);
    });
});

describe('solveTicket', () => {
    it('reads the difficulty from the ticket and solves it', async () => {
        const body = Buffer.from('v1|a05|1700000000000|abcd|8', 'utf8')
            .toString('base64')
            .replace(/=+$/, '');
        const ticket = body + '.sig';
        const nonce = await solveTicket(ticket);
        expect(isValidProof(ticket, nonce, 8)).toBe(true);
    });

    it('rejects a ticket it cannot read', async () => {
        await expect(solveTicket('garbage')).rejects.toThrow(
            /could not be read/
        );
    });
});
