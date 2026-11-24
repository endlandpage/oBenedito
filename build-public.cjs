'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw Error('Invalid output directory');
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw Error('Output cannot be a symlink');
const headers = require('./security-config.cjs');
const blueprint = 'services:\n  - type: web\n    name: o-benedito-demo\n    runtime: static\n    repo: https://github.com/endlandpage/oBenedito\n    branch: main\n    buildCommand: node build-public.cjs\n    staticPublishPath: ./dist\n    autoDeployTrigger: commit\n    headers:\n' + Object.entries(headers).map(([name,value]) => `      - path: /*\n        name: ${name}\n        value: ${JSON.stringify(value)}\n`).join('');
if (process.argv.includes('--write-blueprint')) fs.writeFileSync(path.join(root,'render.yaml'),blueprint);
if (fs.readFileSync(path.join(root,'render.yaml'),'utf8').replace(/\r\n/g,'\n') !== blueprint) throw Error('Run node build-public.cjs --write-blueprint after changing security headers');
// Only this validated build directory is removed. Source files are never deleted.
fs.rmSync(output, { recursive:true, force:true });
fs.mkdirSync(output);
function checkedSource(file) {
  const source = path.join(root,file);
  if (fs.lstatSync(source).isSymbolicLink()) throw Error('Symlinks are not public assets');
  return source;
}
for (const file of ['site-ui.js','hamburgueres.js','verrine.js','model-viewer.min.js','model-viewer.css','vitrine.js','delivery.js','backend-config.js','admin-api.js','admin-panel.js','revisao-local.css','cookie-preferences.js','legal.css','robots.txt','sitemap.xml']) {
  fs.copyFileSync(checkedSource(file),path.join(output,file));
}
function copyAssets(relative) {
  const source = checkedSource(relative);
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(path.join(output,relative),{recursive:true});
    for (const name of fs.readdirSync(source)) {
      if (name.startsWith('.')) throw Error('Hidden assets are not allowed');
      copyAssets(path.join(relative,name));
    }
  } else {
    const verrineLighting = relative === path.join('assets', 'verrine-estudio.hdr');
    if (!verrineLighting && !/\.(?:webp|png|jpe?g|svg|avif|gif|ico|ttf|woff2?|mp4|webm|glb)$/i.test(relative)) throw Error('Unapproved asset type: '+relative);
    fs.copyFileSync(source,path.join(output,relative));
  }
}
copyAssets('assets');
let scripts = 0, styles = 0;
function transformPage(file) {
  let html = fs.readFileSync(checkedSource(file),'utf8').replace(/\r\n?/g,'\n');
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(original,attrs,body) => {
    if (/\bsrc\s*=/i.test(attrs)) return original;
    if (/\btype\s*=\s*["']application\/ld\+json/i.test(attrs)) { JSON.parse(body); return original; }
    const external = `runtime-inline-${++scripts}.js`;
    fs.writeFileSync(path.join(output,external),body);
    return `<script${attrs} src="${external}"></script>`;
  });
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi,(_original,css) => {
    const external = `runtime-style-${++styles}.css`;
    fs.writeFileSync(path.join(output,external),css);
    return `<link rel="stylesheet" href="${external}">`;
  });
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(_original,attrs) => {
    if (!/\bsrc\s*=/i.test(attrs) && !/\btype\s*=\s*["']application\/ld\+json/i.test(attrs)) throw Error('Unexpected inline executable script in '+file);
    return _original;
  });
  fs.writeFileSync(path.join(output,file),html);
}
for (const file of ['index.html','privacidade.html','termos.html','cookies.html']) transformPage(file);
console.log(JSON.stringify({output:'dist',inlineScriptsExternalized:scripts,styleBlocksExternalized:styles,rootFiles:fs.readdirSync(output).filter(n=>n!=='assets')}));
