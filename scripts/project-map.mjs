// project-map.mjs — بيكتب PROJECT_MAP.md (خريطة المشروع للمدير الذكي وللمطوّر). node scripts/project-map.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PM = require(path.join(root, 'project-map.js'));
const entries = PM.build(root);
fs.writeFileSync(path.join(root, 'PROJECT_MAP.md'), PM.toMarkdown(entries) + '\n');
console.log('PROJECT_MAP.md:', entries.length, 'Dateien');
