// Converte as capturas do E2E (docs/screenshots/*.png) em WebP compactos para a documentação.
import { readdirSync, rmSync } from "node:fs";
import sharp from "sharp";

const DIR = "docs/screenshots";
for (const name of readdirSync(DIR).filter((f) => f.endsWith(".png"))) {
  const src = `${DIR}/${name}`;
  const width = name.startsWith("celular") ? 420 : name.startsWith("tablet") ? 640 : 1100;
  await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(src.replace(/\.png$/, ".webp"));
  rmSync(src);
}
console.log("Capturas otimizadas em", DIR);
