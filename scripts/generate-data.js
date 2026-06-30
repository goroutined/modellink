// Generate docs/data.js from data/models/ and data/providers/
const fs = require('fs');
const path = require('path');

function readDir(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

const models = readDir('data/models');
const providers = readDir('data/providers');

const js = 'window.MODELLINK = ' + JSON.stringify({ models, providers }, null, 2) + ';';
fs.writeFileSync('docs/data.js', js, 'utf-8');

console.log(`Generated docs/data.js: ${models.length} models, ${providers.length} providers (${(js.length/1024).toFixed(1)} KB)`);
