const fs = require('fs')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const outFile = 'dist/' + pkg.name + '.js'
let content = fs.readFileSync(outFile, 'utf8')
content = content.split("from '../../dist/index.js'").join('from "../../../dist/index.js"')
fs.writeFileSync(outFile, content)
