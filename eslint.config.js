'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            sourceType: 'commonjs',
            ecmaVersion: 2022,
            globals: {
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none' }],
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
    {
        ignores: ['node_modules/', 'coverage/', '.nyc_output/'],
    },
];
