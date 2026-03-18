import pngToIco from 'png-to-ico';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(__dirname, '../assets/icon.png');
const squarePath = path.join(__dirname, '../build/icon-256.png');
const icoPath = path.join(__dirname, '../build/icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error('Icon PNG not found at', pngPath);
  process.exit(1);
}

const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

// Resize to 256x256 square for ICO
const resizeAndConvert = async () => {
  await sharp(pngPath)
    .resize(256, 256)
    .png()
    .toFile(squarePath);
  return pngToIco(squarePath);
};

resizeAndConvert()
  .then(buf => {
    fs.writeFileSync(icoPath, buf);
    if (fs.existsSync(squarePath)) fs.unlinkSync(squarePath);
    console.log('Created', icoPath);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
