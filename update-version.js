const fs = require('fs')
const path = require('path')

const newVersion = process.argv[2]

if (!newVersion) {
  console.error('❌ Provide version like: 1.2.3')
  process.exit(1)
}

const root = process.cwd()

const targets = [
  path.join(root, 'package.json'),
  path.join(root, 'client', 'package.json'),
  path.join(root, 'server', 'package.json'),

  path.join(root, 'package-lock.json'),
  path.join(root, 'client', 'package-lock.json'),
  path.join(root, 'server', 'package-lock.json'),
]

function updateJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing file: ${filePath}`)
    return
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const json = JSON.parse(raw)

  if (json.version) {
    json.version = newVersion
  }

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n')
  console.log(`Updated ${filePath}`)
}

targets.forEach(updateJson)

console.log(`🎉 Version bumped to ${newVersion}`)
