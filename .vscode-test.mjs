import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    mocha: {
        ui: 'bdd',
        // loader: 'ts-node/esm',
        require: [
            // 'ts-node/register',
            "chai/register-assert", "chai/register-expect", "chai/register-should",
            "./out/test/chai-as-promised/register",
            "./out/test/sinon-chai/register"
        ],

    },
});

