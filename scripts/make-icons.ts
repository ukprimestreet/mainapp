import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { psSvg, BRAND } from "../src/lib/brand";

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/brand", { recursive: true });
const yellow = psSvg();
writeFileSync("src/app/icon.svg", yellow);
const sizes = [16, 32, 48, 64, 128, 192, 512];
(async () => {
  for (const s of sizes) await sharp(Buffer.from(yellow)).resize(s, s).png().toFile(`public/icons/ps-${s}.png`);
  await sharp(Buffer.from(psSvg(BRAND.yellow, BRAND.black, false))).resize(180, 180).png().toFile("src/app/apple-icon.png");
  await sharp(Buffer.from(yellow)).resize(32, 32).png().toFile("src/app/icon.png");
  writeFileSync("public/brand/ps-on-yellow.svg", yellow);
  writeFileSync("public/brand/ps-on-black.svg", psSvg(BRAND.black, BRAND.yellow));
  writeFileSync("public/brand/ps-on-white.svg", psSvg(BRAND.white, BRAND.black));
})();
