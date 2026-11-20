// Run after installing the exact codec into ignored .codec-test as documented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {ImageMagick,initializeImageMagick,MagickFormat} from '../.codec-test/node_modules/@imagemagick/magick-wasm/dist/index.js';
import {rasterHeader} from '../functions/bene-admin/validation.mjs';
const require=createRequire(new URL('../.codec-test/package.json',import.meta.url));
await initializeImageMagick(await readFile(require.resolve('@imagemagick/magick-wasm/magick.wasm')));
test('pinned WASM decoder reencodes all 12 seeds to stripped static WebP',async()=>{
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const photos=JSON.parse(html.match(/id="seed-data"[^>]*>(\[.*?\])<\/div>/s)[1]);
  for(const photo of photos){
    const bytes=new Uint8Array(await readFile(new URL('../../'+photo.src,import.meta.url)));
    const info=rasterHeader(bytes);
    const output=ImageMagick.read(bytes,MagickFormat[info.format],image=>{
      assert.equal(image.width,info.width);assert.equal(image.height,info.height);
      image.autoOrient();const ratio=Math.min(1,1600/Math.max(image.width,image.height));
      if(ratio<1)image.resize(Math.max(1,Math.round(image.width*ratio)),Math.max(1,Math.round(image.height*ratio)));
      image.strip();image.quality=82;
      return image.write(MagickFormat.WebP,data=>new Uint8Array(data));
    });
    const result=rasterHeader(output);assert.equal(result.format,'WebP');assert.ok(Math.max(result.width,result.height)<=1600);
    assert.ok(!new TextDecoder('latin1').decode(output).includes('Exif\0\0'));
  }
});
