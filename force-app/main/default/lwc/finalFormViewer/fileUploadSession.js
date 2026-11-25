/** Memory-only upload lifecycle. No capabilities are written to browser storage or URLs. */
export function createFileUploadSession(request, context) {
    const boundedRequest = async (operation) => {
        let timer;
        const timeout = new Promise((resolve, reject) => {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            'Upload verification timed out. Retry checking or cancel the upload.'
                        )
                    ),
                30000
            );
        });
        try {
            return await Promise.race([request(operation), timeout]);
        } finally {
            clearTimeout(timer);
        }
    };
    let token;
    let creating;
    let generation = 0;
    let disposed = false;
    const assertCurrent = (captured) => {
        if (disposed || captured !== generation)
            throw new Error('Upload context changed.');
    };
    const ensure = async () => {
        if (disposed) throw new Error('Upload context changed.');
        if (token) return token;
        if (!creating) {
            const captured = generation;
            creating = boundedRequest({ ...context, action: 'create' })
                .then((result) => {
                    if (disposed || captured !== generation) {
                        request({
                            action: 'cancel',
                            sessionToken: result.sessionToken
                        }).catch(() => {});
                        assertCurrent(captured);
                    }
                    token = result.sessionToken;
                    return token;
                })
                .finally(() => {
                    creating = undefined;
                });
        }
        return creating;
    };
    return {
        get token() {
            return token;
        },
        ensure,
        async run(operation) {
            const captured = generation;
            const sessionToken = await ensure();
            assertCurrent(captured);
            const result = await boundedRequest({ ...operation, sessionToken });
            assertCurrent(captured);
            return result;
        },
        dispose() {
            disposed = true;
            generation += 1;
            const previous = token;
            token = undefined;
            if (previous)
                request({ action: 'cancel', sessionToken: previous }).catch(
                    () => {}
                );
        },
        complete() {
            disposed = true;
            generation += 1;
            token = undefined;
        }
    };
}
