const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    // The Salesforce Jest resolver does not discover CSS-only shared bundles.
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        '^c/finalStudioStyles$':
            '<rootDir>/force-app/main/default/lwc/finalStudioStyles/finalStudioStyles.css'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
