import { build } from 'esbuild';
import { mkdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
const webOrigin = new URL(
  process.env.LEETBYCOMPANY_WEB_ORIGIN ?? 'http://localhost:3000',
).origin;
if (!webOrigin.startsWith('https://') && webOrigin !== 'http://localhost:3000')
  throw new Error('Use HTTPS or the explicit local development origin');
const out = 'apps/extension/dist';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({
  entryPoints: [
    'apps/extension/src/popup.tsx',
    'apps/extension/src/worker.ts',
    'apps/extension/src/content.ts',
  ],
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    __WEB_ORIGIN__: JSON.stringify(webOrigin),
  },
  legalComments: 'none',
});
await Promise.all(
  ['manifest.json', 'popup.html'].map((f) =>
    copyFile(`apps/extension/${f}`, `${out}/${f}`),
  ),
);
console.log(`Load unpacked: ${out}`);

const manifest = JSON.parse(await readFile(`${out}/manifest.json`, 'utf8'));
manifest.externally_connectable = {
  matches: [`${new URL(webOrigin).protocol}//${new URL(webOrigin).hostname}/*`],
};
await writeFile(
  `${out}/manifest.json`,
  JSON.stringify(manifest, null, 2) + '\n',
);
