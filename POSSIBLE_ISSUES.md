# Future possible issues regarding development

I don't really know typescript very well let alone testing with mocha and chai.
The current setup sets up the global types for testing with chai and mocha via the `.vscode-test.mjs` file. which works
for the type annotations the `tsconfig.json` file is set up to use the `types` directory for global types, specifically the `types/global/index.d.ts` file.
I believe this could be an issues because the types are now included globally and not just in the test files.

Further more the `chai` version is using the major 4 version instead of 5, because of something related to `ESM` and imports. I am unsure, `chai-as-promised` is using the major 7 version instead of 8 for the same reason.

also I would love to use just typescript and reference the sources directly for executing the tests, but I am not sure how to do that.
