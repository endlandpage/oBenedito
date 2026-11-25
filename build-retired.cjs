'use strict';
// The legacy service publishes no application files, so Render's redirect rules
// apply to every former page and asset rather than being shadowed by files.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const output = path.resolve(root, 'dist-retired');
function statOrNull(file) {
  try { return fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
if (path.dirname(output) !== root || path.basename(output) !== 'dist-retired') throw Error('Invalid retirement output');
const outputStat = statOrNull(output);
if (outputStat) {
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) throw Error('Retirement output must be a directory');
  if (fs.readdirSync(output).some(name => name !== 'retired.txt')) throw Error('Retirement output contains unexpected files');
} else fs.mkdirSync(output);
const marker = path.join(output, 'retired.txt');
const markerStat = statOrNull(marker);
if (markerStat && (markerStat.isSymbolicLink() || !markerStat.isFile())) throw Error('Retirement marker must be a regular file');
fs.writeFileSync(marker, 'This legacy address redirects to the active O Benedito site.\n');
console.log(JSON.stringify({output:'dist-retired',files:fs.readdirSync(output)}));
