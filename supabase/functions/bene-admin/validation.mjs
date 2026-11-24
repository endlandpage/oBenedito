export const MAX_FILE = 4 * 1024 * 1024;
export const MAX_PHOTOS = 100;
const categories = new Set(['comida', 'drinks', 'sobremesa', 'ambiente', 'identidade']);
export const HERO_MODELS = Object.freeze(['bene-cheddar','hamburguer-o-benedito','smash-duplo','menu','verrine-o-benedito']);
export class InputError extends Error {}
export function siteSettings(settings, photos) {
  const keys=['heroModel','featureOneId','featureTwoId'];
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).length !== keys.length || !keys.every(key=>Object.hasOwn(settings,key))) throw new InputError('Configurações inválidas.');
  if (!HERO_MODELS.includes(settings.heroModel)) throw new InputError('Modelo inicial inválido.');
  const out={heroModel:settings.heroModel};
  for (const key of keys.slice(1)) {
    const id=settings[key];
    if (id!==null && (typeof id!=='string' || !/^(bene-[1-9][0-9]?|[0-9a-f-]{36})$/.test(id) || !photos.some(photo=>photo.id===id && photo.visible===true))) throw new InputError('Escolha uma foto visível da galeria para o destaque.');
    out[key]=id;
  }
  return out;
}
export function photoCrop(crop) {
  if (crop === null) return null;
  if (!crop || typeof crop !== 'object' || Array.isArray(crop) || Object.keys(crop).length !== 3 || !['x','y','zoom'].every(key => Object.hasOwn(crop,key))) throw new InputError('Enquadramento inválido.');
  const {x,y,zoom}=crop;
  if (![x,y,zoom].every(value => typeof value === 'number' && Number.isFinite(value)) || x<0 || x>100 || y<0 || y>100 || zoom<1 || zoom>3) throw new InputError('Enquadramento inválido.');
  return {x,y,zoom};
}
export function photoMetadata(p, position) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^(bene-[1-9][0-9]?|[0-9a-f-]{36})$/.test(p.id)) throw new InputError('Foto inválida.');
  const out = {id:p.id, position};
  for (const [key,max,required] of [['title',70,true],['caption',240,false],['alt',300,true]]) {
    if (typeof p[key] !== 'string' || p[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(p[key])) throw new InputError('Texto inválido.');
    out[key] = p[key].trim();
    if (required && !out[key]) throw new InputError('Preencha nome e descrição.');
  }
  if (!categories.has(p.category) || typeof p.visible !== 'boolean') throw new InputError('Categoria ou visibilidade inválida.');
  if (Object.hasOwn(p,'crop')) out.crop=photoCrop(p.crop);
  return {...out,category:p.category,visible:p.visible};
}
export function saveInput(body) {
  if (body?.action !== 'save' || !Number.isSafeInteger(body.revision) || body.revision < 0 || !Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) throw new InputError('Rascunho inválido.');
  const photos = body.photos.map(photoMetadata);
  if (new Set(photos.map(p=>p.id)).size !== photos.length) throw new InputError('Foto duplicada.');
  const out={revision:body.revision,photos};
  if (Object.hasOwn(body,'settings')) out.settings=siteSettings(body.settings,photos);
  return out;
}
// Inspect the actual bytes BEFORE a decoder allocates its pixel buffers. The
// decoder is then constrained to this detected raster format, never auto-detect.
export function rasterHeader(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24 || bytes.length > MAX_FILE) throw new InputError('Imagem vazia ou maior que 4 MB.');
  const v = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const str=(p,n)=>String.fromCharCode(...bytes.subarray(p,p+n));
  let width=0,height=0,format='';
  if (str(0,8)==='\x89PNG\r\n\x1a\n' && str(12,4)==='IHDR' && v.getUint32(8)===13) {
    format='Png';width=v.getUint32(16);height=v.getUint32(20);
    let pos=8;
    while(pos+12<=bytes.length){const size=v.getUint32(pos);const kind=str(pos+4,4);if(size>bytes.length-pos-12)throw new InputError('PNG incompleto.');if(kind==='acTL')throw new InputError('Use uma imagem sem animação.');pos+=size+12;if(kind==='IEND')break;}
  } else if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {
    format='Jpeg';let pos=2;
    const sof=new Set([0xc0,0xc1,0xc2]);
    while(pos+4<bytes.length){if(bytes[pos++]!==255)throw new InputError('JPEG inválido.');while(bytes[pos]===255)pos++;const marker=bytes[pos++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const size=v.getUint16(pos);if(size<2||pos+size>bytes.length)throw new InputError('JPEG incompleto.');if(sof.has(marker)){if(size<8)throw new InputError('JPEG inválido.');height=v.getUint16(pos+3);width=v.getUint16(pos+5);break;}pos+=size;}
  } else if(str(0,4)==='RIFF' && str(8,4)==='WEBP' && v.getUint32(4,true)+8===bytes.length){
    format='WebP';let pos=12,canvas=null,frames=0;
    while(pos+8<=bytes.length){
      const kind=str(pos,4),size=v.getUint32(pos+4,true),start=pos+8;
      if(size>bytes.length-start)throw new InputError('WebP incompleto.');
      if(kind==='ANIM'||kind==='ANMF')throw new InputError('Use uma imagem sem animação.');
      if(kind==='VP8X'){
        if(pos!==12||size!==10||(bytes[start]&2))throw new InputError('WebP inválido ou animado.');
        canvas=[1+bytes[start+4]+(bytes[start+5]<<8)+(bytes[start+6]<<16),1+bytes[start+7]+(bytes[start+8]<<8)+(bytes[start+9]<<16)];
      }else if(kind==='VP8 '){
        if(size<10||(bytes[start]&1)!==0||bytes[start+3]!==0x9d||bytes[start+4]!==1||bytes[start+5]!==0x2a)throw new InputError('WebP inválido.');
        width=v.getUint16(start+6,true)&0x3fff;height=v.getUint16(start+8,true)&0x3fff;frames++;
      }else if(kind==='VP8L'){
        if(size<5||bytes[start]!==0x2f)throw new InputError('WebP inválido.');
        const bits=v.getUint32(start+1,true);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);frames++;
      }
      pos=start+size+(size%2);
    }
    if(pos!==bytes.length||frames!==1||(canvas&&(canvas[0]!==width||canvas[1]!==height)))throw new InputError('WebP com dimensões inconsistentes.');
  }
  if(!format||width<1||height<1||width>4096||height>4096||width*height>4_000_000)throw new InputError('Use JPEG, PNG ou WebP estático de até 4 megapixels e 4096 px por lado.');
  return {format,width,height};
}
export async function boundedBody(request,max) {
  const declared=request.headers.get('content-length');
  if(declared && (!/^\d+$/.test(declared)||Number(declared)>max))throw new InputError('Pedido maior que o limite.');
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader();const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new InputError('Pedido maior que o limite.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
