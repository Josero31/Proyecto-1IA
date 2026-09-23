// Falla si algún archivo del bundle publicado supera su presupuesto de tamaño (gzip).
// El SDK se descarga en el navegador del cliente final, así que el tamaño es un requisito,
// no una preferencia. Para subir un límite hay que justificarlo en el PR y en CHANGELOG.md.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGETS_KB = {
  'dist/agichat-widget-sdk.js': 40,
  'dist/agichat-widget-sdk.umd.cjs': 40,
};

let failed = false;

for (const [file, budgetKb] of Object.entries(BUDGETS_KB)) {
  let source;
  try {
    source = readFileSync(file);
  } catch {
    console.error(`✗ ${file} no existe. Corre "pnpm build" primero.`);
    failed = true;
    continue;
  }
  const rawKb = source.length / 1024;
  const gzipKb = gzipSync(source, { level: 9 }).length / 1024;
  const ok = gzipKb <= budgetKb;
  failed ||= !ok;
  console.log(
    `${ok ? '✓' : '✗'} ${file}: ${rawKb.toFixed(1)} kB (${gzipKb.toFixed(1)} kB gzip, ` +
      `límite ${budgetKb} kB gzip)`,
  );
}

if (failed) {
  process.exit(1);
}
