const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        // sfdx-lwc-jest ships modalHeader/Body/Footer stubs but not the base
        // class they live in, so a LightningModal subclass cannot be mounted
        // at all without a local stub.
        '^lightning/modal$':
            '<rootDir>/force-app/test/jest-mocks/lightning/modal',
        // The Salesforce Jest resolver does not discover CSS-only shared bundles.
        '^c/finalStudioStyles$':
            '<rootDir>/force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.css'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver'],
    // Other Claude sessions keep git worktrees under .claude/worktrees; their
    // copies of the tests must never run against this checkout's components.
    testPathIgnorePatterns: [
        ...(jestConfig.testPathIgnorePatterns || []),
        '<rootDir>/.claude/',
        // shared fixtures that test files import (familiesContract.js,
        // focusContract.js, textContrastContract.js) are not suites
        // (no \w: on Windows jest turns a backslash before a letter into a
        // path separator)
        '__tests__/[A-Za-z]+Contract[.]js$'
    ]
};
