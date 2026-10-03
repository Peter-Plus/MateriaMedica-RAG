const fs = require('node:fs');
const path = require('node:path');
const client = path.resolve(__dirname, '..');
const output = path.join(client, 'dist', 'web');
fs.mkdirSync(path.join(output, 'vendor'), { recursive: true });
for (const file of ['styles.css', 'app.js', 'markdown.js', 'platform.js']) {
  fs.copyFileSync(path.join(client, 'renderer', file), path.join(output, file));
}
const vendors = [
  ['markdown-it/dist/browser/markdown-it.umd.min.js', 'markdown-it.min.js', 'markdown-it'],
  ['dompurify/dist/purify.min.js', 'purify.min.js', 'dompurify']
];
let html = fs.readFileSync(path.join(client, 'renderer/index.html'), 'utf8')
  .replace("connect-src 'none'", "connect-src 'self'");
for (const [source, target, pkg] of vendors) {
  fs.copyFileSync(path.join(client, 'node_modules', source), path.join(output, 'vendor', target));
  fs.copyFileSync(path.join(client, 'node_modules', pkg, 'LICENSE'), path.join(output, 'vendor', pkg + '-LICENSE.txt'));
  html = html.replace('../node_modules/' + source, 'vendor/' + target);
}
fs.writeFileSync(path.join(output, 'index.html'), html);
console.log('Web files: ' + output);
