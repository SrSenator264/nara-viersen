import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('dist/client/catalog.js',root),'utf8')+'\n'+await readFile(new URL('dist/client/menu-source.js',root),'utf8');
const menu = vm.runInNewContext(source+'\ncatalog',{});
await writeFile(new URL('dist/server/guide-menu.js',root),'// Generated from the published menu; prices are integer cents.\nexport default '+JSON.stringify(menu)+';\n');
