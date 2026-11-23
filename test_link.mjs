// node test_link.mjs — prüft die reine Link-Bildung (Obsidian wird attrappiert).
import Module from 'node:module';
import { createRequire } from 'node:module';
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'obsidian') return { Plugin: class {}, PluginSettingTab: class {} };
  return origLoad.call(this, req, ...rest);
};
const require = createRequire(import.meta.url);
const { buildUrl, mapPath } = require('./main.js');

let n = 0, bad = 0;
const eq = (got, want, msg) => { n++; if (got !== want) { bad++; console.log('FAIL', msg, '→', got, '≠', want); } };

const base = { baseUrl: 'https://gastelai.example.de/', target: 'files', customTemplate: '', pathPrefix: '' };
eq(buildUrl(base, 'Ordner/Meine Notiz.md'), 'https://gastelai.example.de/?datei=Ordner%2FMeine%20Notiz.md', 'Dateien-Ziel');
eq(buildUrl({ ...base, target: 'notes' }, 'Ä & ö#1.md'), 'https://gastelai.example.de/notizen?pfad=%C3%84%20%26%20%C3%B6%231.md', 'Notizen-Ziel kodiert Sonderzeichen');
eq(buildUrl({ ...base, baseUrl: '' }, 'a.md'), null, 'ohne Adresse kein Link');
eq(buildUrl({ ...base, target: 'custom', customTemplate: '{base}/x/{pathNoExt}?n={basename}' }, 'A/b c.md'),
  'https://gastelai.example.de/x/A%2Fb%20c?n=b%20c', 'eigene Vorlage');
eq(buildUrl({ ...base, target: 'custom', customTemplate: '' }, 'a.md'), null, 'leere eigene Vorlage');
eq(buildUrl({ ...base, pathPrefix: '/akb/' }, 'akb/Projekt/X.md'), 'https://gastelai.example.de/?datei=Projekt%2FX.md', 'Präfix wird abgeschnitten');
eq(buildUrl({ ...base, pathPrefix: 'akb' }, 'privat/X.md'), null, 'außerhalb des Präfix');
eq(buildUrl({ ...base, pathPrefix: 'akb' }, 'akbx/X.md'), null, 'Präfix nur als ganzer Ordner');
eq(mapPath('akb', 'akb'), null, 'Ordner selbst');
eq(buildUrl(base, 'anhang/Bild.png'), 'https://gastelai.example.de/?datei=anhang%2FBild.png', 'Nicht-Markdown im Dateien-Ziel (GastelAI öffnet es als Vorschau)');
eq(buildUrl({ ...base, target: 'notes' }, 'anhang/Bericht.pdf'), null, 'Leseansicht: nur Notizen');
console.log(`${n - bad}/${n} Checks grün`);
process.exit(bad ? 1 : 0);
