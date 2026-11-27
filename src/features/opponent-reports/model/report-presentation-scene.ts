/** Flatten the existing SVG pages into editable presentation objects, without rasterizing courts. */
export interface ScenePaint { fill?: string; fillOpacity: number; stroke?: string; strokeOpacity: number; strokeWidth: number; dashed: boolean }
export interface ScenePoint { x: number; y: number }
interface SceneBox { x: number; y: number; width: number; height: number }
export type SceneObject =
  | ({ kind: 'text'; text: string; fontSize: number; bold: boolean; italic?: boolean; color: string; rtl: boolean } & SceneBox)
  | ({ kind: 'rect' | 'ellipse'; radius?: number; paint: ScenePaint } & SceneBox)
  | { kind: 'path'; points: ScenePoint[]; closed: boolean; paint: ScenePaint }
  /** An embedded PNG or JPEG (the club logo), already fitted in its box. */
  | ({ kind: 'image'; href: string } & SceneBox);
export interface PresentationScene { width: number; height: number; pages: SceneObject[][] }
const number = (element: Element, name: string, fallback = 0) => {
  const length = (element as unknown as Record<string, { baseVal?: { value?: number } }>)[name]?.baseVal;
  return typeof length?.value === 'number' ? length.value : Number.parseFloat(element.getAttribute(name) ?? '') || fallback;
};
const paintColor = (value: string): string | undefined => {
  if (value === 'none' || value === 'transparent') return undefined;
  if (value.startsWith('#')) return value.slice(1);
  const rgb = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  if (!rgb) throw new Error(`Unsupported SVG paint: ${value}`);
  return rgb.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
};
/** Alpha written inside an rgba() colour (1 otherwise): PowerPoint/ODP need it as opacity. */
export const paintAlpha = (value: string): number => {
  const alpha = value.match(/^rgba\(\s*\d+[, ]+\s*\d+[, ]+\s*\d+\s*[,/]\s*([\d.]+)(%?)\s*\)/);
  if (!alpha) return 1;
  const parsed = Number(alpha[1]) / (alpha[2] ? 100 : 1);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 1;
};
function linearPath(element: SVGPathElement): Array<{ points: ScenePoint[]; closed: boolean }> | null {
  const d = element.getAttribute('d') ?? '';
  if (/[acqst]/i.test(d)) return null;
  const tokens = d.match(/[mlhvz]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const paths: Array<{ points: ScenePoint[]; closed: boolean }> = [];
  let x = 0, y = 0, command = '', i = 0;
  while (i < tokens.length) {
    if (/^[mlhvz]$/i.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    if (/z/i.test(command)) {
      const last = paths[paths.length - 1];
      if (last) { last.closed = true; x = last.points[0].x; y = last.points[0].y; }
      command = ''; continue;
    }
    if (!command) return null;
    if (/[ml]/i.test(command)) {
      if (i + 1 >= tokens.length) return null;
      x = Number(tokens[i++]) + (relative ? x : 0); y = Number(tokens[i++]) + (relative ? y : 0);
      if (/m/i.test(command)) { paths.push({ points: [], closed: false }); command = relative ? 'l' : 'L'; }
    } else if (/h/i.test(command)) x = Number(tokens[i++]) + (relative ? x : 0);
    else if (/v/i.test(command)) y = Number(tokens[i++]) + (relative ? y : 0);
    else return null;
    if (![x, y].every(Number.isFinite)) return null;
    paths[paths.length - 1]?.points.push({ x, y });
  }
  return paths;
}

const EMBEDDED_IMAGE = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/;

/** The bytes and type of an embedded PNG or JPEG data URL, or null for anything else. */
export function embeddedImage(href: string): { bytes: Uint8Array; extension: 'png' | 'jpeg'; mime: string } | null {
  const match = href.match(EMBEDDED_IMAGE);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    return { bytes: Uint8Array.from(binary, (ch) => ch.charCodeAt(0)), extension: match[1] as 'png' | 'jpeg', mime: `image/${match[1]}` };
  } catch {
    return null;
  }
}

/** Pixel size read from the PNG or JPEG header, without decoding the picture. */
export function embeddedImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    // Start-of-frame markers carry the size; DHT, JPG and DAC share the range but do not.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/** The box an image really covers inside its viewport, following SVG preserveAspectRatio (meet; 'none' stretches). */
export function fitImageBox(box: { x: number; y: number; width: number; height: number }, natural: { width: number; height: number } | null, preserveAspectRatio = 'xMidYMid meet') {
  const align = preserveAspectRatio.trim().split(/\s+/)[0] ?? 'xMidYMid';
  if (!natural || natural.width <= 0 || natural.height <= 0 || align === 'none') return { ...box };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale, height = natural.height * scale;
  const along = (part: string, room: number) => part === 'Min' ? 0 : part === 'Max' ? room : room / 2;
  const [, ax = 'Mid', ay = 'Mid'] = align.match(/^x(Min|Mid|Max)Y(Min|Mid|Max)$/) ?? [];
  return { x: box.x + along(ax, box.width - width), y: box.y + along(ay, box.height - height), width, height };
}

/** An omitted marker viewBox uses its own coordinates, including Firefox's null baseVal. */
export function markerViewportScale(viewBox: {width: number; height: number} | null | undefined, width: number, height: number): number {
  return viewBox?.width && viewBox.height ? Math.min(width/viewBox.width,height/viewBox.height) : 1;
}

export async function svgPagesToPresentationScene(pages: readonly string[], width: number, height: number): Promise<PresentationScene> {
  // Measure with the PDF typeface when available. A font download failure must
  // still allow export using the browser fallback, just like the web preview.
  await Promise.allSettled([document.fonts.load('12px Ubuntu'), document.fonts.load('bold 12px Ubuntu'), document.fonts.load('italic 12px Ubuntu'), document.fonts.load('bold italic 12px Ubuntu')]);
  await document.fonts.ready;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(host);
  const scene: PresentationScene = { width, height, pages: [] };
  try {
    for (const source of pages) {
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) throw new Error('Invalid report SVG');
      const root = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      root.style.fontFamily = 'Ubuntu, sans-serif';
      host.replaceChildren(root);
      const rootMatrix = root.getScreenCTM();
      if (!rootMatrix) throw new Error('SVG measurement unavailable');
      const inverse = rootMatrix.inverse(), objects: SceneObject[] = [];
      const visit = (element: Element) => {
        const tag = element.localName;
        if (['defs','title','desc','metadata','style','clipPath','marker'].includes(tag)) return;
        if (['svg','g','a'].includes(tag)) { [...element.children].forEach(visit); return; }
        if (!(element instanceof SVGGraphicsElement)) throw new Error(`Unsupported SVG object: ${tag}`);
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const screen = element.getScreenCTM();
        if (!screen) throw new Error('SVG transform unavailable');
        const matrix = inverse.multiply(screen);
        const scale = Math.hypot(matrix.a, matrix.b);
        const point = (x: number, y: number): ScenePoint => ({ x: matrix.a*x+matrix.c*y+matrix.e, y: matrix.b*x+matrix.d*y+matrix.f });
        let opacity = 1;
        for (let parent: Element | null = element; parent instanceof SVGElement; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
        const paint: ScenePaint = { fill: paintColor(style.fill), fillOpacity: Number(style.fillOpacity)*paintAlpha(style.fill)*opacity,
          stroke: paintColor(style.stroke), strokeOpacity: Number(style.strokeOpacity)*paintAlpha(style.stroke)*opacity,
          strokeWidth: Number.parseFloat(style.strokeWidth)*scale || 0, dashed: style.strokeDasharray !== 'none' };
        if (tag === 'text') {
          const node = element as SVGTextElement;
          const value = node.textContent ?? '';
          const size = Number.parseFloat(style.fontSize) * scale;
          const advance = node.getComputedTextLength()*scale;
          const baseline = point(node.x.baseVal[0]?.value ?? 0,node.y.baseVal[0]?.value ?? 0);
          const anchor = style.textAnchor;
          objects.push({ kind:'text', text:value, x:baseline.x-(anchor==='middle'?advance/2:anchor==='end'?advance:0),
            y:baseline.y-size*.905, width:Math.max(1,advance+size*.05), height:size*1.4,
            fontSize:size,italic:style.fontStyle==='italic'||style.fontStyle==='oblique',bold:Number(style.fontWeight)>=600||style.fontWeight==='bold',color:paint.fill??'000000',rtl:/[\u0600-\u06ff]/.test(value) });
          return;
        }
        if (tag === 'image') {
          // Only embedded PNG/JPEG pictures (the club logo); anything else is left out.
          const href = element.getAttribute('href') ?? element.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
          const image = embeddedImage(href);
          if (!image) return;
          const a = point(number(element,'x'), number(element,'y'));
          const b = point(number(element,'x') + number(element,'width'), number(element,'y') + number(element,'height'));
          const box = { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(b.x-a.x), height: Math.abs(b.y-a.y) };
          objects.push({ kind: 'image', href, ...fitImageBox(box, embeddedImageSize(image.bytes), element.getAttribute('preserveAspectRatio') ?? undefined) });
          return;
        }
        let paths: Array<{ points: ScenePoint[]; closed: boolean }> = [];
        if (tag === 'rect' || tag === 'circle' || tag === 'ellipse') {
          const rect = tag==='rect';
          const rx = rect ? number(element,'width')/2 : number(element,tag==='circle'?'r':'rx');
          const ry = rect ? number(element,'height')/2 : number(element,tag==='circle'?'r':'ry');
          const cx = rect ? number(element,'x')+rx : number(element,'cx');
          const cy = rect ? number(element,'y')+ry : number(element,'cy');
          if (Math.abs(matrix.b)<1e-6&&Math.abs(matrix.c)<1e-6) {
            const a=point(cx-rx,cy-ry),b=point(cx+rx,cy+ry);
            objects.push({ kind:rect?'rect':'ellipse',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),radius:number(element,'rx')*scale,paint });
            return;
          }
          paths=[{points:rect?[point(cx-rx,cy-ry),point(cx+rx,cy-ry),point(cx+rx,cy+ry),point(cx-rx,cy+ry)]:Array.from({length:96},(_,i)=>point(cx+rx*Math.cos(i*Math.PI/48),cy+ry*Math.sin(i*Math.PI/48))),closed:true}];
        } else if (tag==='line') {
          paths=[{points:[point(number(element,'x1'),number(element,'y1')),point(number(element,'x2'),number(element,'y2'))],closed:false}];
          paint.fill=undefined;
        } else if (tag==='polygon'||tag==='polyline') {
          const coords=(element.getAttribute('points')??'').match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)?.map(Number)??[];
          paths=[{points:Array.from({length:Math.floor(coords.length/2)},(_,i)=>point(coords[i*2],coords[i*2+1])),closed:tag==='polygon'}];
        } else if (tag==='path') {
          const node=element as SVGPathElement, linear=linearPath(node);
          if(linear) paths=linear.map(path=>({...path,points:path.points.map(p=>point(p.x,p.y))}));
          else {
            // Editable polygonal approximation of curves; straight court/cone edges remain exact.
            const length=node.getTotalLength(),count=Math.min(512,Math.max(24,Math.ceil(length*scale*2)));
            paths=[{points:Array.from({length:count+1},(_,i)=>{const p=node.getPointAtLength(length*i/count);return point(p.x,p.y);}),closed:/z\s*$/i.test(node.getAttribute('d')??'')}];
          }
        } else throw new Error(`Unsupported SVG object: ${tag}`);
        paths.filter(p=>p.points.length>1).forEach(path=>objects.push({kind:'path',...path,paint}));
        if (style.markerEnd !== 'none' && paths.length) {
          const id = style.markerEnd.match(/#([^"')]+)["')]/)?.[1];
          const marker = id ? [...root.querySelectorAll('marker')].find(node => node.id === id) : undefined;
          const points = paths[paths.length - 1].points, end = points[points.length - 1], before = points[points.length - 2];
          if (marker && end && before) {
            const orient = marker.getAttribute('orient') ?? '0';
            const angle = orient.startsWith('auto') ? Math.atan2(end.y-before.y,end.x-before.x) : Number.parseFloat(orient)*Math.PI/180;
            // Firefox may expose null baseVal when the marker has no viewBox.
            const viewBox = marker.viewBox?.baseVal;
            const viewportScale = markerViewportScale(viewBox,number(marker,'markerWidth',3),number(marker,'markerHeight',3));
            const units = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : Number.parseFloat(style.strokeWidth);
            const factor = scale*units*viewportScale;
            // Keep the SVG marker's own size and reference point. Attack arrows use
            // userSpaceOnUse, so multiplying their heads by stroke width distorts them.
            for (const child of marker.querySelectorAll('path')) {
              const markerStyle = getComputedStyle(child);
              for (const path of linearPath(child) ?? []) {
                objects.push({kind:'path',closed:path.closed,points:path.points.map(p=>{
                  const x=(p.x-number(marker,'refX'))*factor, y=(p.y-number(marker,'refY'))*factor;
                  return {x:end.x+x*Math.cos(angle)-y*Math.sin(angle),y:end.y+x*Math.sin(angle)+y*Math.cos(angle)};
                }),paint:{fill:paintColor(markerStyle.fill),fillOpacity:Number(markerStyle.fillOpacity)*paintAlpha(markerStyle.fill)*opacity,stroke:paintColor(markerStyle.stroke),strokeOpacity:Number(markerStyle.strokeOpacity)*paintAlpha(markerStyle.stroke)*opacity,strokeWidth:Number.parseFloat(markerStyle.strokeWidth)*factor,dashed:false}});
              }
            }
          }
        }
      };
      visit(root);scene.pages.push(objects);
    }
  } finally { host.remove(); }
  return scene;
}
