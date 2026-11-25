import { createFileUploadSession } from '../fileUploadSession';

const context = { formId: 'form-a', versionId: 'version-a' };
describe('memory-only file upload session', () => {
    it('coalesces simultaneous creates and reserves several files on the same attempt', async () => {
        const request = jest.fn(async (operation) => {
            if (operation.action === 'create') {
                return { sessionToken: 'attempt.secret' };
            }
            return { action: operation.action };
        });
        const session = createFileUploadSession(request, context);
        await Promise.all([
            session.run({ action: 'reserve', elementId: 'a' }),
            session.run({ action: 'reserve', elementId: 'b' })
        ]);
        expect(
            request.mock.calls.filter(([op]) => op.action === 'create')
        ).toHaveLength(1);
        expect(
            request.mock.calls
                .filter(([op]) => op.action === 'reserve')
                .every(([op]) => op.sessionToken === 'attempt.secret')
        ).toBe(true);
    });
    it('invalidates late replies after identity teardown', async () => {
        let release;
        const request = jest.fn((op) => {
            if (op.action === 'create') {
                return new Promise((resolve) => {
                    release = resolve;
                });
            }
            return Promise.resolve({});
        });
        const session = createFileUploadSession(request, context);
        const pending = session.ensure();
        session.dispose();
        release({ sessionToken: 'old.secret' });
        await expect(pending).rejects.toThrow('context changed');
        expect(session.token).toBeUndefined();
        expect(request).toHaveBeenCalledWith({
            action: 'cancel',
            sessionToken: 'old.secret'
        });
    });
    it('does not cancel consumed files after confirmed success', async () => {
        const request = jest.fn(async () => ({
            sessionToken: 'attempt.secret'
        }));
        const session = createFileUploadSession(request, context);
        await session.ensure();
        session.complete();
        session.dispose();
        expect(
            request.mock.calls.filter(([op]) => op.action === 'cancel')
        ).toHaveLength(0);
    });
    it('retains the same token after a retryable operation failure', async () => {
        const request = jest
            .fn()
            .mockResolvedValueOnce({ sessionToken: 'attempt.secret' })
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ files: [] });
        const session = createFileUploadSession(request, context);
        await expect(session.run({ action: 'status' })).rejects.toThrow(
            'offline'
        );
        await session.run({ action: 'status' });
        expect(request).toHaveBeenCalledTimes(3);
        expect(request.mock.calls[2][0].sessionToken).toBe('attempt.secret');
    });
});
