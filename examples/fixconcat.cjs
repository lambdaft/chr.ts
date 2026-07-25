const fs = require('fs');
const path = require('path');
const baseDir = '/home/pc/mew/CHR.ts/examples';

for (const d of fs.readdirSync(baseDir, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === 'interop') continue;
  const chrFile = path.join(baseDir, d.name, d.name + '.chr');
  let content = fs.readFileSync(chrFile, 'utf8');
  
  // Replace "text" + var with stringConcat("text", var)
  content = content.replace(/"([^"]*)"\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)/g, 'stringConcat("$1", $2)');
  
  fs.writeFileSync(chrFile, content);
}
console.log('Fixed string concatenation');
