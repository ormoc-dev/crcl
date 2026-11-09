/**
 * Copy static app files into dist/ (same idea as the movie/lantaw deploy).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name)
    const dest = path.join(to, name)
    const st = fs.statSync(src)
    if (st.isDirectory()) copyDir(src, dest)
    else copyFile(src, dest)
  }
}

rmDir(dist)
fs.mkdirSync(dist, { recursive: true })

const files = ['index.html', 'sw.js', 'manifest.webmanifest', '_redirects']
for (const file of files) {
  const src = path.join(root, file)
  if (fs.existsSync(src)) copyFile(src, path.join(dist, file))
}

for (const dir of ['css', 'js', 'public']) {
  const src = path.join(root, dir)
  if (fs.existsSync(src)) copyDir(src, path.join(dist, dir))
}

console.log('build-dist: wrote dist/')
