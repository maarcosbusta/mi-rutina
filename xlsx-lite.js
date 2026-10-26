/* Lector mínimo de .xlsx/.xlsm (sin dependencias): devuelve {hoja: {rows:{r:{c:valor}}, merges:[...]}} */
(function(){
const td=new TextDecoder();
async function inflate(u8){
  const ds=new DecompressionStream('deflate-raw');
  const w=ds.writable.getWriter();w.write(u8);w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function unzip(buf){
  const u8=new Uint8Array(buf),dv=new DataView(buf);
  let e=u8.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error('El archivo no es un Excel válido.');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const files={};
  for(let i=0;i<n;i++){
    if(dv.getUint32(p,true)!==0x02014b50)break;
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const name=td.decode(u8.subarray(p+46,p+46+nl));
    const start=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true);
    files[name]={method,data:u8.subarray(start,start+csize)};
    p+=46+nl+el+cl;
  }
  return async name=>{
    const f=files[name];if(!f)return null;
    return td.decode(f.method===0?f.data:await inflate(f.data));
  };
}
const xml=s=>new DOMParser().parseFromString(s,'application/xml');
const colNum=ref=>{let n=0;for(const ch of ref.replace(/\d+/g,''))n=n*26+ch.charCodeAt(0)-64;return n-1};
const rowNum=ref=>parseInt(ref.replace(/\D+/g,''),10)-1;
async function readWorkbook(buf){
  const get=await unzip(buf);
  const wbx=await get('xl/workbook.xml');if(!wbx)throw new Error('El archivo no es un Excel válido.');
  const rels=xml(await get('xl/_rels/workbook.xml.rels'));
  const relMap={};for(const r of rels.getElementsByTagName('Relationship'))relMap[r.getAttribute('Id')]=r.getAttribute('Target');
  const sst=[];const sx=await get('xl/sharedStrings.xml');
  if(sx)for(const si of xml(sx).getElementsByTagName('si')){let t='';for(const x of si.getElementsByTagName('t'))t+=x.textContent;sst.push(t)}
  const sheets={};
  for(const s of xml(wbx).getElementsByTagName('sheet')){
    const name=s.getAttribute('name');
    const rid=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    let tg=relMap[rid]||'';tg=tg.startsWith('/')?tg.slice(1):'xl/'+tg;
    sheets[name]=async()=>{
      const d=xml(await get(tg));const rows={};
      for(const c of d.getElementsByTagName('c')){
        const ref=c.getAttribute('r'),t=c.getAttribute('t'),vEl=c.getElementsByTagName('v')[0];
        let v=null;
        if(t==='inlineStr'){v='';for(const x of c.getElementsByTagName('t'))v+=x.textContent}
        else if(vEl){const raw=vEl.textContent;v=t==='s'?sst[+raw]:(t==='str'||t==='e'||t==='b')?raw:(raw!==''&&!isNaN(raw)?+raw:raw)}
        if(v===null||v==='')continue;
        (rows[rowNum(ref)]=rows[rowNum(ref)]||{})[colNum(ref)]=v;
      }
      const merges=[];
      for(const m of d.getElementsByTagName('mergeCell')){const [a,b]=m.getAttribute('ref').split(':');if(b)merges.push({r1:rowNum(a),c1:colNum(a),r2:rowNum(b),c2:colNum(b)})}
      let maxR=0;for(const r in rows)maxR=Math.max(maxR,+r);
      return{rows,merges,maxR};
    };
  }
  return sheets;
}
window.readXlsx=readWorkbook;
})();
