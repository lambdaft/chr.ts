import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const data = new Uint8Array(fs.readFileSync('/home/pc/mew/CHR.ts/docs/lnai.pdf'));
const doc = await getDocument({data}).promise;
let text = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const pageText = content.items.map(item => item.str).join(' ');
  text += pageText + '\n';
}
fs.writeFileSync('/tmp/lnai-paper.txt', text);
console.log('Extracted', text.length, 'chars');
console.log('---FIRST 3000 CHARS---');
console.log(text.substring(0, 3000));
