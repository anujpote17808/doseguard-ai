import * as esbuild from 'esbuild';
import { readdirSync } from 'fs';
import { join } from 'path';

const handlersDir = './src/handlers';
const files = readdirSync(handlersDir).filter((f) => f.endsWith('.ts'));

await esbuild.build({
  entryPoints: files.map((f) => join(handlersDir, f)),
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir: './dist/bundled',
  sourcemap: true,
  minify: false,
  external: [],
});

console.log(`Bundled ${files.length} Lambda handlers into dist/bundled/`);

