/**
 * finalProofOfWork - the browser half of the guest bot check (a small puzzle).
 *
 * The server hands a guest page a signed ticket that says how hard the puzzle
 * is (a number of leading zero BITS). The page must find a decimal nonce where
 *
 *   SHA-256( UTF-8( ticket + ':' + nonce ) )   (compared as raw bits)
 *
 * starts with that many zero bits. Apex re-checks it with one digest call, so
 * the work is real but cheap to verify. This is friction against bulk spam, not
 * proof of a human (docs/FinalDesign/IMPL_PLAN_GUEST_BOT_CHECKS.md).
 *
 * Why hand-written SHA-256: the browser's built-in `crypto.subtle.digest` is
 * asynchronous for every call, far too slow for the hundreds of thousands of
 * tiny hashes a puzzle needs. This one is synchronous and reuses its buffers;
 * the ticket prefix is hashed ONCE (a "midstate") so each attempt only hashes
 * the last block or two.
 *
 * The solver never hogs the page: it works in slices bounded by ELAPSED TIME
 * (about 10 ms, so typing and scrolling stay smooth on any device), yields to
 * the browser between slices with setTimeout, pauses while the tab is hidden
 * and resumes when it becomes visible, and can be cancelled with an
 * AbortSignal. There is deliberately NO give-up timer: a slow phone keeps
 * going rather than locking a real respondent out.
 *
 * Plain functions, no template. The digest helpers are exported for tests,
 * which share their input vectors with FinalGuestTicketTest (Apex).
 */

const SLICE_MS = 10;
const ATTEMPTS_PER_CHECK = 32;

// SHA-256 constants (FIPS 180-4): fractional parts of the cube roots of the
// first 64 primes (K) and of the square roots of the first 8 (INIT).
function firstPrimes(count) {
    const out = [];
    for (let n = 2; out.length < count; n++) {
        if (out.every((p) => n % p !== 0)) {
            out.push(n);
        }
    }
    return out;
}
const FRACTION_UNIT = 4294967296;
const K = Int32Array.from(
    firstPrimes(64).map(
        (p) => Math.floor((Math.cbrt(p) % 1) * FRACTION_UNIT) | 0
    )
);
const INIT = Int32Array.from(
    firstPrimes(8).map(
        (p) => Math.floor((Math.sqrt(p) % 1) * FRACTION_UNIT) | 0
    )
);

/** A string as UTF-8 bytes (no TextEncoder: not every host provides one). */
export function utf8Bytes(text) {
    const out = [];
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
        let c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
            const d = s.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff) {
                c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
                i++;
            }
        }
        if (c < 0x80) {
            out.push(c);
        } else if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        } else if (c < 0x10000) {
            out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        } else {
            out.push(
                0xf0 | (c >> 18),
                0x80 | ((c >> 12) & 63),
                0x80 | ((c >> 6) & 63),
                0x80 | (c & 63)
            );
        }
    }
    return Uint8Array.from(out);
}

/** One SHA-256 block: folds buf[off..off+64) into the state `h` in place. */
function compress(h, buf, off, w) {
    for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        w[i] =
            (buf[j] << 24) |
            (buf[j + 1] << 16) |
            (buf[j + 2] << 8) |
            buf[j + 3];
    }
    for (let i = 16; i < 64; i++) {
        const a = w[i - 15];
        const b = w[i - 2];
        const s0 =
            ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 =
            ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i++) {
        const S1 =
            ((e >>> 6) | (e << 26)) ^
            ((e >>> 11) | (e << 21)) ^
            ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        const S0 =
            ((a >>> 2) | (a << 30)) ^
            ((a >>> 13) | (a << 19)) ^
            ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
}

/** Write the 64-bit big-endian bit length of `byteLength` bytes at the end. */
function writeLength(buf, byteLength) {
    const bits = byteLength * 8;
    const hi = Math.floor(bits / FRACTION_UNIT);
    const lo = bits >>> 0;
    const end = buf.length;
    for (let i = 0; i < 4; i++) {
        buf[end - 8 + i] = (hi >>> (24 - i * 8)) & 255;
        buf[end - 4 + i] = (lo >>> (24 - i * 8)) & 255;
    }
}

/** SHA-256 of a string's UTF-8 bytes, as 64 lowercase hex characters. */
export function sha256Hex(text) {
    const msg = utf8Bytes(text);
    const blocks = Math.ceil((msg.length + 9) / 64);
    const buf = new Uint8Array(blocks * 64);
    buf.set(msg, 0);
    buf[msg.length] = 0x80;
    writeLength(buf, msg.length);
    const h = Int32Array.from(INIT);
    const w = new Int32Array(64);
    for (let b = 0; b < blocks; b++) {
        compress(h, buf, b * 64, w);
    }
    let hex = '';
    for (let i = 0; i < 8; i++) {
        hex += (h[i] >>> 0).toString(16).padStart(8, '0');
    }
    return hex;
}

/** How many leading zero BITS a lowercase hex digest starts with. */
export function leadingZeroBits(hex) {
    let bits = 0;
    for (let i = 0; i < hex.length; i++) {
        const v = parseInt(hex[i], 16);
        if (v === 0) {
            bits += 4;
            continue;
        }
        bits += Math.clz32(v) - 28;
        break;
    }
    return bits;
}

/** Does `nonce` solve the puzzle for this ticket and difficulty? */
export function isValidProof(ticket, nonce, difficulty) {
    return leadingZeroBits(sha256Hex(`${ticket}:${nonce}`)) >= difficulty;
}

/**
 * The difficulty a ticket carries (its payload is v1|formId|issuedAt|random|
 * difficulty, base64url before the dot), or null when it cannot be read.
 * Reading it is only a convenience: the server re-reads its own signed copy.
 */
export function ticketDifficulty(ticket) {
    try {
        const seg = String(ticket).split('.')[0];
        const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '==='.slice((b64.length + 3) % 4);
        const parts = atob(padded).split('|');
        const n = Number(parts[4]);
        return parts.length === 5 && Number.isInteger(n) && n >= 0 && n <= 32
            ? n
            : null;
    } catch {
        return null;
    }
}

/**
 * The nonce search itself, sliced. Counts upward from 0 in decimal, keeping
 * the digits in the final block(s) and bumping them like an odometer, so an
 * attempt costs one or two block compressions instead of re-hashing the whole
 * ticket.
 */
function createSearch(ticket, difficulty) {
    const prefix = utf8Bytes(`${ticket}:`);
    const fullBlocks = Math.floor(prefix.length / 64);
    const mid = Int32Array.from(INIT);
    const w = new Int32Array(64);
    for (let b = 0; b < fullBlocks; b++) {
        compress(mid, prefix, b * 64, w);
    }
    const rest = prefix.subarray(fullBlocks * 64);
    const r = rest.length;
    const h = new Int32Array(8);
    let digits = 1; // how many decimal digits the nonce has right now
    let tail;
    let blocks;

    function layout() {
        const needed = r + digits + 1 + 8;
        blocks = Math.ceil(needed / 64);
        const next = new Uint8Array(blocks * 64);
        next.set(rest, 0);
        // the digits start (or restart) at 0...0 on a new length
        for (let i = 0; i < digits; i++) {
            next[r + i] = 48;
        }
        next[r + digits] = 0x80;
        writeLength(next, prefix.length + digits);
        tail = next;
    }
    layout();
    // "1" followed by zeros once the count outgrows its digits
    function bump() {
        let i = r + digits - 1;
        while (i >= r) {
            if (tail[i] === 57) {
                tail[i] = 48;
                i--;
            } else {
                tail[i]++;
                return;
            }
        }
        digits++;
        layout();
        tail[r] = 49;
    }

    const wholeWords = Math.floor(difficulty / 32);
    const restBits = difficulty % 32;
    function passes() {
        // difficulty <= 32 is the only shape the server issues; the general
        // form below also covers anything larger.
        for (let i = 0; i < wholeWords; i++) {
            if (h[i] !== 0) {
                return false;
            }
        }
        return restBits === 0 || Math.clz32(h[wholeWords]) >= restBits;
    }

    function digitsText() {
        let s = '';
        for (let i = 0; i < digits; i++) {
            s += String.fromCharCode(tail[r + i]);
        }
        return s;
    }

    /** Try up to `count` nonces; the winning nonce text, or null. */
    function run(count) {
        for (let n = 0; n < count; n++) {
            h.set(mid);
            for (let b = 0; b < blocks; b++) {
                compress(h, tail, b * 64, w);
            }
            if (passes()) {
                return digitsText();
            }
            bump();
        }
        return null;
    }
    return { run };
}

function abortError() {
    const e = new Error('The proof-of-work search was cancelled.');
    e.name = 'AbortError';
    return e;
}

function nowMs() {
    return typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
}

function isHidden() {
    return typeof document !== 'undefined' && document.hidden === true;
}

/**
 * Find the nonce for a ticket. Resolves with the nonce as a decimal string
 * (the first one that works, counting up from "0"). Rejects with an Error
 * named "AbortError" when `signal` aborts; never gives up on its own.
 *
 * @param {string} ticket
 * @param {number} difficulty leading zero bits required
 * @param {{signal?: AbortSignal, sliceMs?: number}} [options]
 */
export function solve(ticket, difficulty, options = {}) {
    const { signal, sliceMs = SLICE_MS } = options;
    return new Promise((resolve, reject) => {
        if (signal && signal.aborted) {
            reject(abortError());
            return;
        }
        let search;
        try {
            search = createSearch(String(ticket), difficulty);
        } catch (e) {
            reject(e);
            return;
        }
        let settled = false;
        let timer = null;
        let paused = false;

        const cleanup = () => {
            clearTimeout(timer);
            timer = null;
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', onVisible);
            }
            if (signal) {
                signal.removeEventListener('abort', onAbort);
            }
        };
        const finish = (fn, value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            fn(value);
        };
        function onAbort() {
            finish(reject, abortError());
        }
        function onVisible() {
            if (paused && !isHidden() && !settled) {
                paused = false;
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                timer = setTimeout(step, 0);
            }
        }
        function step() {
            timer = null;
            if (settled) {
                return;
            }
            if (isHidden()) {
                paused = true; // visibilitychange resumes it
                return;
            }
            try {
                const deadline = nowMs() + sliceMs;
                do {
                    const found = search.run(ATTEMPTS_PER_CHECK);
                    if (found !== null) {
                        finish(resolve, found);
                        return;
                    }
                } while (nowMs() < deadline);
            } catch (e) {
                finish(reject, e);
                return;
            }
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            timer = setTimeout(step, 0); // let the page breathe
        }

        if (signal) {
            signal.addEventListener('abort', onAbort);
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', onVisible);
        }
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        timer = setTimeout(step, 0);
    });
}

/** solve(), reading the difficulty out of the ticket itself. */
export function solveTicket(ticket, options) {
    const difficulty = ticketDifficulty(ticket);
    if (difficulty === null) {
        return Promise.reject(new Error('The ticket could not be read.'));
    }
    return solve(ticket, difficulty, options);
}
