#! /usr/bin/env node

import { build } from 'esbuild';
import fs from 'fs';
import { createRequire } from 'module'; // Bring in the ability to create the 'require' method

const require = createRequire(import.meta.url); // construct the require method
const { dependencies } = require('./package.json');
// use the require method
const lambdas = fs.readdirSync('./src/lambda');

const shared = {
    bundle: true,
    external: Object.keys(dependencies),
    format: 'esm',
    platform: 'neutral', // ESM
    sourcemap: 'linked'
};

for (const lambda of lambdas) {
    const result = await build({
        ...shared,
        entryPoints: [`src/lambda/${lambda}/index.mts`],
        outfile: `dist/${lambda}/index.mjs`
    });
    console.log(`Built ${lambda}`, result);
}
