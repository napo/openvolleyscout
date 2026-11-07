import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { posix } from 'node:path';
import { buildReportOdp, buildReportPptx } from './report-presentation-export';
import { markerViewportScale, type PresentationScene } from './report-presentation-scene';
const paint={fill:'EAF3F3',fillOpacity:.4,stroke:'142E42',strokeOpacity:1,strokeWidth:1,dashed:true};
const scene:PresentationScene={width:419.528,height:595.276,pages:[[
 {kind:'rect',x:20,y:40,width:210,height:210,radius:4,paint},
 {kind:'path',points:[{x:20,y:40},{x:230,y:40}],closed:false,paint},
 {kind:'ellipse',x:50,y:80,width:23,height:23,paint},
 {kind:'path',points:[{x:90,y:40},{x:25,y:200},{x:150,y:200}],closed:true,paint},
 {kind:'text',x:25,y:35,width:170,height:15,fontSize:10,bold:true,italic:true,color:'142E42',text:'Coach <#8> & direction 42%',rtl:false},
 {kind:'text',x:25,y:60,width:170,height:15,fontSize:10,bold:false,color:'142E42',text:'نص عربي 日本語',rtl:true},
],[]]};
describe('editable report presentation exports',()=>{
 it('supports Firefox markers with a null viewBox without aborting presentation export',()=>{
  expect(markerViewportScale(null,4,4)).toBe(1);
  expect(markerViewportScale(undefined,4,4)).toBe(1);
  expect(markerViewportScale({width:0,height:0},4,4)).toBe(1);
  expect(markerViewportScale({width:10,height:10},6,5)).toBe(.5);
 });
 it('writes native PPTX shapes/text and resolves every internal relationship',()=>{
  const entries=unzipSync(buildReportPptx(scene,'Report & title'));
  const slide=strFromU8(entries['ppt/slides/slide1.xml']);
  expect(slide).toContain('Coach &lt;#8&gt; &amp; direction 42%');
  expect(slide).toContain('نص عربي 日本語');expect(slide).toContain('rtl="1"');
  expect(slide).toContain('<a:custGeom>');expect(slide).toContain('prst="ellipse"');
  expect(slide).toContain('typeface="Ubuntu"');
  expect(slide).toContain('b="1" i="1"');
  expect(slide).not.toContain('<p:pic>');expect(slide).not.toContain('<a:blip');
  expect(Object.keys(entries).some(p=>p.startsWith('ppt/media/'))).toBe(false);
  expect(strFromU8(entries['ppt/presentation.xml'])).toContain('cx="5328006"');
  for(const [path,bytes] of Object.entries(entries).filter(([path])=>path.endsWith('.rels'))){
   const base=path==='_rels/.rels'?'':posix.dirname(posix.dirname(path));
   for(const match of strFromU8(bytes).matchAll(/Target="([^"]+)"/g))expect(entries[posix.normalize(posix.join(base,match[1]))],`${path} -> ${match[1]}`).toBeDefined();
  }
 });
 it('preserves the full A4 plan dimensions, page count and content in PPTX',()=>{
  const a4={...scene,width:595.276,height:841.89};
  const entries=unzipSync(buildReportPptx(a4,'Full report'));
  const presentation=strFromU8(entries['ppt/presentation.xml']);
  expect(presentation).toContain('cx="7560005" cy="10692003"');
  expect(presentation.match(/<p:sldId /g)).toHaveLength(a4.pages.length);
  expect(strFromU8(entries['ppt/slides/slide1.xml'])).toContain('direction 42%');
 });
 it('writes OpenDocument with the uncompressed mimetype first, native editable objects and page size',()=>{
  const bytes=buildReportOdp(scene,'Open report');
  expect(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(8,true)).toBe(0);
  const entries=unzipSync(bytes), content=strFromU8(entries['content.xml']);
  expect(Object.keys(entries)[0]).toBe('mimetype');
  expect(strFromU8(entries.mimetype)).toBe('application/vnd.oasis.opendocument.presentation');
  expect(content.match(/<draw:page /g)).toHaveLength(2);
  expect(content).toContain('fo:font-family="Ubuntu"');
  expect(content).toContain('fo:font-style="italic"');
  expect(content).toContain('<draw:line');expect(content).toContain('fo:padding-left="0cm"');expect(content).toContain('fo:wrap-option="no-wrap"');expect(content).toContain('<draw:polygon');expect(content).toContain('<draw:ellipse');
  expect(content).toContain('<text:p text:style-name=');expect(content).toContain('Coach');
  expect(content).toContain('نص');expect(content).toContain('日本語');
  expect(content).not.toContain('<draw:image');
  expect(strFromU8(entries['styles.xml'])).toContain('fo:page-width="14.80002cm"');
 });
});
