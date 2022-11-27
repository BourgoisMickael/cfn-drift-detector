import { build } from 'esbuild';
import { createRequire } from "module"; // Bring in the ability to create the 'require' method
import fs from 'fs';

const require = createRequire(import.meta.url); // construct the require method
const packageJson = require("./package.json") // use the require method
const lambdas = fs.readdirSync('./src/lambda')

const shared = {
    bundle: true,
    external: Object.keys(packageJson.dependencies),
    format: 'esm',
    platform: 'neutral', // ESM
    sourcemap: 'linked',
}

for (const lambda of lambdas) {
    build({
        ...shared,
        entryPoints: [`src/lambda/${lambda}/index.mts`],
        outfile: `dist/${lambda}/index.mjs`
    })
}

