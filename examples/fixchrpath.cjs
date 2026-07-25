const fs = require('fs');
const path = require('path');
const baseDir = '/home/pc/mew/CHR.ts/examples';

for (const d of fs.readdirSync(baseDir, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'interop') continue;
  const tsFile = path.join(baseDir, d.name, d.name + '.ts');
  let content = fs.readFileSync(tsFile, 'utf8');
  const old = `join(__dirname, '${d.name}.chr')`;
  const repl = `join(__dirname, '..', '${d.name}.chr')`;
  content = content.replace(old, repl);
  fs.writeFileSync(tsFile, content);
}
console.log('Fixed CHR paths');
