/** Native OOXML/OpenDocument exports. No upload and no external conversion service. */
import { zipSync, strToU8, type Zippable } from 'fflate';
import { APP_METADATA } from '@src/lib/constants/app';
import { saveFile } from '@src/lib/utils/save-file';
import { BOOKLET_WIDTH, BOOKLET_HEIGHT, type ReportBookletPlan } from './report-booklet';
import { svgPagesToPresentationScene, type PresentationScene, type SceneObject, type ScenePaint } from './report-presentation-scene';
const xml = (s: string) => s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!));
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const A='http://schemas.openxmlformats.org/drawingml/2006/main',P='http://schemas.openxmlformats.org/presentationml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const emu=(value:number)=>Math.round(value*12700);
const cm=(value:number)=>`${(value*2.54/72).toFixed(5)}cm`;
const relationships=(entries:Array<[string,string,string]>)=>`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.map(([id,type,target])=>`<Relationship Id="${id}" Type="${R}/${type}" Target="${xml(target)}"/>`).join('')}</Relationships>`;
const emptyTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const open=(tag:string)=>`${declaration}<p:${tag} xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}">`;
const solid=(color:string,opacity=1)=>`<a:solidFill><a:srgbClr val="${color}"><a:alpha val="${Math.round(Math.max(0,Math.min(1,opacity))*100000)}"/></a:srgbClr></a:solidFill>`;
const paintPpt=(paint:ScenePaint)=>`${paint.fill?solid(paint.fill,paint.fillOpacity):'<a:noFill/>'}<a:ln w="${emu(paint.strokeWidth)}">${paint.stroke?solid(paint.stroke,paint.strokeOpacity):'<a:noFill/>'}${paint.dashed?'<a:prstDash val="dash"/>':''}</a:ln>`;
function pptObject(object:SceneObject,index:number):string {
  let x:number,y:number,width:number,height:number,geometry:string;
  if(object.kind==='path'){
    x=Math.min(...object.points.map(p=>p.x));y=Math.min(...object.points.map(p=>p.y));
    width=Math.max(.01,Math.max(...object.points.map(p=>p.x))-x);height=Math.max(.01,Math.max(...object.points.map(p=>p.y))-y);
    geometry=`<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="1000000" h="1000000">${object.points.map((p,i)=>`<a:${i?'lnTo':'moveTo'}><a:pt x="${Math.round((p.x-x)/width*1e6)}" y="${Math.round((p.y-y)/height*1e6)}"/></a:${i?'lnTo':'moveTo'}>`).join('')}${object.closed?'<a:close/>':''}</a:path></a:pathLst></a:custGeom>`;
  }else{
    ({x,y,width,height}=object);
    const rounded=object.kind==='rect'&&object.radius;
    geometry=`<a:prstGeom prst="${object.kind==='ellipse'?'ellipse':rounded?'roundRect':'rect'}"><a:avLst>${rounded?`<a:gd name="adj" fmla="val ${Math.round(Math.min(.5,object.radius!/Math.max(.01,Math.min(width,height)))*100000)}"/>`:''}</a:avLst></a:prstGeom>`;
  }
  const transform=`<a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(Math.max(.01,width))}" cy="${emu(Math.max(.01,height))}"/></a:xfrm>`;
  const prefix=`<p:sp><p:nvSpPr><p:cNvPr id="${index+2}" name="${object.kind} ${index+1}"/><p:cNvSpPr${object.kind==='text'?' txBox="1"':''}/><p:nvPr/></p:nvSpPr><p:spPr>${transform}${geometry}`;
  if(object.kind!=='text')return `${prefix}${paintPpt(object.paint)}</p:spPr></p:sp>`;
  return `${prefix}<a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${object.rtl?'r':'l'}" rtl="${object.rtl?'1':'0'}"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr lang="${object.rtl?'ar-SA':'en-US'}" sz="${Math.max(100,Math.round(object.fontSize*100))}" b="${object.bold?'1':'0'}" i="${object.italic?'1':'0'}">${solid(object.color)}<a:latin typeface="Ubuntu"/><a:ea typeface="Ubuntu"/><a:cs typeface="Ubuntu"/></a:rPr><a:t xml:space="preserve">${xml(object.text)}</a:t></a:r><a:endParaRPr sz="${Math.max(100,Math.round(object.fontSize*100))}"/></a:p></p:txBody></p:sp>`;
}

/** Implements the PresentationML package relationships described by ISO/IEC 29500. */
export function buildReportPptx(scene:PresentationScene,title:string):Uint8Array {
  const files:Zippable={};const put=(path:string,value:string)=>{files[path]=strToU8(value);};
  const types=[['/ppt/presentation.xml','presentationml.presentation.main'],['/ppt/slideMasters/slideMaster1.xml','presentationml.slideMaster'],['/ppt/slideLayouts/slideLayout1.xml','presentationml.slideLayout'],['/ppt/presProps.xml','presentationml.presProps'],['/ppt/theme/theme1.xml','theme']];
  scene.pages.forEach((_,i)=>types.push([`/ppt/slides/slide${i+1}.xml`,'presentationml.slide']));
  put('[Content_Types].xml',`${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${types.map(([path,type])=>`<Override PartName="${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  put('_rels/.rels',relationships([['rId1','officeDocument','ppt/presentation.xml']]).replace('</Relationships>','<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'));
  put('docProps/core.xml',`${declaration}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>${xml(APP_METADATA.author.name)}</dc:creator><dc:description>${xml(APP_METADATA.name+' · '+APP_METADATA.urls.webApp+' · GNU AGPL v3 or later ('+APP_METADATA.license+')')}</dc:description></cp:coreProperties>`);
  put('ppt/presentation.xml',`${open('presentation')}<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${scene.pages.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(scene.width)}" cy="${emu(scene.height)}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  put('ppt/_rels/presentation.xml.rels',relationships([['rId1','slideMaster','slideMasters/slideMaster1.xml'],...scene.pages.map((_,i):[string,string,string]=>[`rId${i+2}`,'slide',`slides/slide${i+1}.xml`]),[`rId${scene.pages.length+2}`,'presProps','presProps.xml']]));
  put('ppt/presProps.xml',`${open('presentationPr')}</p:presentationPr>`);
  put('ppt/slideMasters/slideMaster1.xml',`${open('sldMaster')}<p:cSld><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels',relationships([['rId1','slideLayout','../slideLayouts/slideLayout1.xml'],['rId2','theme','../theme/theme1.xml']]));
  put('ppt/slideLayouts/slideLayout1.xml',`${declaration}<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels',relationships([['rId1','slideMaster','../slideMasters/slideMaster1.xml']]));
  const palette={dk1:'142E42',lt1:'FFFFFF',dk2:'203847',lt2:'EAF3F3',accent1:'007E80',accent2:'DC2626',accent3:'2563EB',accent4:'64748B',accent5:'B97813',accent6:'CDDBDF',hlink:'007E80',folHlink:'536775'};
  const fills=Array.from({length:3},()=>'<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>').join('');
  const fonts='<a:latin typeface="Ubuntu"/><a:ea typeface="Ubuntu"/><a:cs typeface="Ubuntu"/>';
  put('ppt/theme/theme1.xml',`${declaration}<a:theme xmlns:a="${A}" name="OpenVolleyScout"><a:themeElements><a:clrScheme name="OpenVolleyScout">${Object.entries(palette).map(([key,value])=>`<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join('')}</a:clrScheme><a:fontScheme name="Ubuntu"><a:majorFont>${fonts}</a:majorFont><a:minorFont>${fonts}</a:minorFont></a:fontScheme><a:fmtScheme name="OpenVolleyScout"><a:fillStyleLst>${fills}</a:fillStyleLst><a:lnStyleLst>${Array.from({length:3},()=>'<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>').join('')}</a:lnStyleLst><a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fills}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
  scene.pages.forEach((page,i)=>{
    put(`ppt/slides/slide${i+1}.xml`,`${open('sld')}<p:cSld><p:spTree>${emptyTree}${page.map(pptObject).join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    put(`ppt/slides/_rels/slide${i+1}.xml.rels`,relationships([['rId1','slideLayout','../slideLayouts/slideLayout1.xml']]));
  });
  return zipSync(files,{level:6});
}

const ODP='application/vnd.oasis.opendocument.presentation';
const namespaces='xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"';
/** OpenDocument 1.3 native text objects and editable vector geometry. */
export function buildReportOdp(scene:PresentationScene,title:string):Uint8Array {
  const files:Zippable={mimetype:[strToU8(ODP),{level:0}]};
  const styles:string[]=[];
  const pages=scene.pages.map((page,pageIndex)=>`<draw:page draw:name="Page ${pageIndex+1}" draw:master-page-name="Default">${page.map((object,index)=>{
    const id=`s${pageIndex}_${index}`;
    if(object.kind==='text'){
      styles.push(`<style:style style:name="${id}" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="top" fo:padding-top="0cm" fo:padding-bottom="0cm" fo:padding-left="0cm" fo:padding-right="0cm" fo:wrap-option="no-wrap" draw:fit-to-size="false" fo:min-width="0cm" fo:min-height="0cm" draw:auto-grow-height="false" draw:auto-grow-width="false"/></style:style><style:style style:name="p${id}" style:family="paragraph"><style:paragraph-properties fo:margin="0cm" fo:line-height="100%" fo:text-align="${object.rtl?'end':'start'}" style:writing-mode="${object.rtl?'rl-tb':'lr-tb'}"/><style:text-properties fo:font-family="Ubuntu" style:font-name="Ubuntu" fo:font-size="${object.fontSize.toFixed(3)}pt" style:font-size-asian="${object.fontSize.toFixed(3)}pt" style:font-size-complex="${object.fontSize.toFixed(3)}pt" fo:font-style="${object.italic?'italic':'normal'}" style:font-style-asian="${object.italic?'italic':'normal'}" style:font-style-complex="${object.italic?'italic':'normal'}" fo:font-weight="${object.bold?'bold':'normal'}" style:font-weight-asian="${object.bold?'bold':'normal'}" style:font-weight-complex="${object.bold?'bold':'normal'}" fo:color="#${object.color}"/></style:style>`);
      const value=object.text.split(/( +)/).map(token=>/^ +$/.test(token)?`<text:s text:c="${token.length}"/>`:xml(token)).join('');
      return `<draw:rect draw:name="Text ${index+1}" draw:style-name="${id}" draw:text-style-name="p${id}" svg:x="${cm(object.x)}" svg:y="${cm(object.y)}" svg:width="${cm(object.width)}" svg:height="${cm(object.height)}"><text:p text:style-name="p${id}">${value}</text:p></draw:rect>`;
    }
    const paint=object.paint;
    styles.push(`<style:style style:name="${id}" style:family="graphic"><style:graphic-properties draw:fill="${paint.fill?'solid':'none'}"${paint.fill?` draw:fill-color="#${paint.fill}" draw:opacity="${(paint.fillOpacity*100).toFixed(2)}%"`:''} draw:stroke="${paint.stroke?paint.dashed?'dash':'solid':'none'}"${paint.stroke?` svg:stroke-color="#${paint.stroke}" svg:stroke-width="${cm(paint.strokeWidth)}" svg:stroke-opacity="${(paint.strokeOpacity*100).toFixed(2)}%"${paint.dashed?' draw:stroke-dash="Dash"':''}`:''}/></style:style>`);
    if(object.kind!=='path') return `<draw:${object.kind} draw:name="${object.kind} ${index+1}" draw:style-name="${id}" svg:x="${cm(object.x)}" svg:y="${cm(object.y)}" svg:width="${cm(object.width)}" svg:height="${cm(object.height)}"${object.kind==='rect'&&object.radius?` draw:corner-radius="${cm(object.radius)}"`:''}/>`;
    if (object.points.length===2 && !object.closed) {
      const [a,b]=object.points;
      return `<draw:line draw:name="Line ${index+1}" draw:style-name="${id}" svg:x1="${cm(a.x)}" svg:y1="${cm(a.y)}" svg:x2="${cm(b.x)}" svg:y2="${cm(b.y)}"/>`;
    }
    const x=Math.min(...object.points.map(p=>p.x)),y=Math.min(...object.points.map(p=>p.y));
    const w=Math.max(.01,Math.max(...object.points.map(p=>p.x))-x),h=Math.max(.01,Math.max(...object.points.map(p=>p.y))-y);
    const points=object.points.map(p=>`${Math.round((p.x-x)/w*1e6)},${Math.round((p.y-y)/h*1e6)}`).join(' ');
    return `<draw:${object.closed?'polygon':'polyline'} draw:name="Path ${index+1}" draw:style-name="${id}" svg:x="${cm(x)}" svg:y="${cm(y)}" svg:width="${cm(w)}" svg:height="${cm(h)}" svg:viewBox="0 0 1000000 1000000" draw:points="${points}"/>`;
  }).join('')}</draw:page>`);
  files['content.xml']=strToU8(`${declaration}<office:document-content ${namespaces} office:version="1.3"><office:font-face-decls><style:font-face style:name="Ubuntu" svg:font-family="Ubuntu"/></office:font-face-decls><office:automatic-styles>${styles.join('')}</office:automatic-styles><office:body><office:presentation>${pages.join('')}</office:presentation></office:body></office:document-content>`);
  files['styles.xml']=strToU8(`${declaration}<office:document-styles ${namespaces} office:version="1.3"><office:styles><draw:stroke-dash draw:name="Dash" draw:style="rect" draw:dots1="1" draw:dots1-length="0.06cm" draw:distance="0.05cm"/></office:styles><office:automatic-styles><style:page-layout style:name="Layout"><style:page-layout-properties fo:page-width="${cm(scene.width)}" fo:page-height="${cm(scene.height)}" fo:margin="0cm" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="Layout"/></office:master-styles></office:document-styles>`);
  files['meta.xml']=strToU8(`${declaration}<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${xml(title)}</dc:title><dc:creator>${xml(APP_METADATA.author.name)}</dc:creator></office:meta></office:document-meta>`);
  files['META-INF/manifest.xml']=strToU8(`${declaration}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODP}"/>${['content.xml','styles.xml','meta.xml'].map(file=>`<manifest:file-entry manifest:full-path="${file}" manifest:media-type="text/xml"/>`).join('')}</manifest:manifest>`);
  return zipSync(files,{level:6});
}

export async function exportReportPresentation(plan:ReportBookletPlan,format:'pptx'|'odp',fileName:string,title:string):Promise<void>{
  const scene=await svgPagesToPresentationScene(plan.pages,plan.width??BOOKLET_WIDTH,plan.height??BOOKLET_HEIGHT);
  const bytes=format==='pptx'?buildReportPptx(scene,title):buildReportOdp(scene,title);
  const mime=format==='pptx'?'application/vnd.openxmlformats-officedocument.presentationml.presentation':ODP;
  await saveFile(fileName.replace(/\.pdf$/,`.${format}`),new Blob([new Uint8Array(bytes).buffer],{type:mime}),mime);
}
