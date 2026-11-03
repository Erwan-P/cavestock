"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import type { CellarData, CellarWine } from "@/lib/cellar-types";
import { formatVintage } from "@/lib/wine-vintage";
import "./virtual-cellar.css";
export default function VirtualCellar({data,onClose}:{data:CellarData;onClose:()=>void}) {
 const [region,setRegion]=useState<string|null>(null),[wine,setWine]=useState<CellarWine|null>(null),[error,setError]=useState(false);
 const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.innerWidth<600),[regionPage,setRegionPage]=useState(0),[winePage,setWinePage]=useState(0);
 const collection=useMemo(()=>{
  const groups=new Map<string,CellarWine[]>();
  for(const item of data.wines){if(item.quantity<=0)continue;const name=item.region.trim()||'Sans région';const list=groups.get(name)||[];list.push(item);groups.set(name,list);}
  const positions=new Map(data.categories.map(c=>[c.id,c.position]));
  for(const list of groups.values())list.sort((a,b)=>(positions.get(a.categoryId)||0)-(positions.get(b.categoryId)||0)||a.domaine.localeCompare(b.domaine,'fr')||a.vintage-b.vintage||a.id.localeCompare(b.id));
  return [...groups].sort(([a],[b])=>a.localeCompare(b,'fr'));
 },[data]);
 const regionSize=compact?6:12,wineSize=compact?12:24;
 const allWines=region?collection.find(([name])=>name===region)?.[1]||[]:[];
 const total=region?allWines.length:collection.length;
 const pageSize=region?wineSize:regionSize;
 const pageCount=Math.max(1,Math.ceil(total/pageSize));
 const page=Math.min(region?winePage:regionPage,pageCount-1);
 function changePage(next:number){setWine(null);if(region)setWinePage(next);else setRegionPage(next);}
 const infoRef=useRef<HTMLElement>(null),infoPoint=useRef({x:0,y:0});
 function placeInfo(){const el=infoRef.current;if(!el)return;const {x,y}=infoPoint.current;const w=el.offsetWidth,h=el.offsetHeight;el.style.left=`${Math.max(10,Math.min(innerWidth-w-10,x+18+w>innerWidth?x-w-18:x+18))}px`;el.style.top=`${Math.max(10,Math.min(innerHeight-h-10,y+18+h>innerHeight?y-h-18:y+18))}px`;}
 useEffect(()=>{if(wine)placeInfo();},[wine]);
 const navigate=useRef<(name:string|null)=>void>(()=>{});
 const host=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDivElement>(null);
 const opener=useRef<HTMLElement|null>(document.activeElement instanceof HTMLElement?document.activeElement:null);
 useDialogFocus(true,dialog,()=>{if(wine)setWine(null);else if(region)navigate.current(null);else onClose();});
 useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow="hidden";const siblings=[...document.body.children].filter((e):e is HTMLElement=>e instanceof HTMLElement&&!e.contains(dialog.current)&&!e.inert);siblings.forEach(e=>{e.inert=true;});return()=>{document.body.style.overflow=previous;siblings.forEach(e=>{e.inert=false;});requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}));};},[]);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(()=>setCompact(element.clientWidth<600));observer.observe(element);setCompact(element.clientWidth<600);return()=>observer.disconnect();},[]);
 useEffect(()=>{
 if(!host.current)return;const container=host.current;const scene=new THREE.Scene();scene.background=new THREE.Color('#171714');scene.fog=new THREE.Fog('#171714',38,75);
 let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setError(true);return;}
 setError(false);
 renderer.setPixelRatio(Math.min(devicePixelRatio,compact?1.25:1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;container.appendChild(renderer.domElement);renderer.domElement.className='vc3-canvas-enter';
 const camera=new THREE.PerspectiveCamera(42,1,.1,100);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const wood=new THREE.MeshStandardMaterial({color:'#80512d',roughness:.82});const darkwood=new THREE.MeshStandardMaterial({color:'#382516',roughness:.9});const iron=new THREE.MeshStandardMaterial({color:'#383a34',metalness:.75,roughness:.4});
 const unitBox=new THREE.BoxGeometry(1,1,1);
 const bodyGeometry=new THREE.LatheGeometry([[0,0],[.19,0],[.21,.08],[.21,.85],[.18,1],[.075,1.16],[.075,1.5],[0,1.5]].map(([r,h])=>new THREE.Vector2(r,h)),16);
 const labelGeometry=new THREE.CylinderGeometry(.214,.214,.36,16),foilGeometry=new THREE.CylinderGeometry(.081,.081,.26,12);
 const cream=new THREE.MeshStandardMaterial({color:'#eee0ba',roughness:.8}),gold=new THREE.MeshStandardMaterial({color:'#c7a451',metalness:.6,roughness:.35});
 const glassMaterials=new Map<string,THREE.MeshStandardMaterial>();
 const materials:THREE.Material[]=[wood,darkwood,iron,cream,gold];const textures:THREE.Texture[]=[];const targets:THREE.Object3D[]=[];const labels:{element:HTMLButtonElement,point:THREE.Vector3}[]=[];
 function box(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,parent:THREE.Object3D=scene){const m=new THREE.Mesh(unitBox,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function text(value:string,x:number,y:number,z:number,w=3){
 const c=document.createElement('canvas');c.width=1024;c.height=200;const ctx=c.getContext('2d')!;
 ctx.fillStyle='#20180f';ctx.fillRect(0,0,1024,200);ctx.strokeStyle='#cbaa70';ctx.lineWidth=5;ctx.strokeRect(7,7,1010,186);ctx.fillStyle='#fff1d2';ctx.textAlign='center';ctx.textBaseline='middle';
 const split=value.lastIndexOf(' · '),lines=split>=0?[value.slice(0,split),value.slice(split+3)]:[value];
 lines.forEach((line,index)=>{let font=lines.length===1?88:index===0?66:48;ctx.font=`600 ${font}px Georgia`;while(ctx.measureText(line).width>960&&font>24){font-=2;ctx.font=`600 ${font}px Georgia`;}ctx.fillText(line,512,lines.length===1?100:index===0?78:152);});
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(texture);
 const mat=new THREE.MeshBasicMaterial({map:texture});materials.push(mat);const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,w*.22),mat);plane.rotation.x=-Math.PI/2;plane.position.set(x,y,z);scene.add(plane);
 }

 function bottle(x:number,y:number,z:number,category:string,entry?:CellarWine){const g=new THREE.Group();g.position.set(x,y,z);const color=/blanc/i.test(category)?'#7d853d':/ros/i.test(category)?'#b87855':'#183d29';let glass=glassMaterials.get(color);if(!glass){glass=new THREE.MeshStandardMaterial({color,metalness:.18,roughness:.22});glassMaterials.set(color,glass);materials.push(glass);}const body=new THREE.Mesh(bodyGeometry,glass);body.castShadow=true;g.add(body);const label=new THREE.Mesh(labelGeometry,cream);label.position.y=.57;g.add(label);const foil=new THREE.Mesh(foilGeometry,/champ/i.test(category)?gold:iron);foil.position.y=1.4;g.add(foil);g.rotation.x=-Math.PI/2;scene.add(g);if(entry){g.traverse(o=>{o.userData.wine=entry;});targets.push(body,label,foil);}return g;}
 const entries=collection.slice(page*regionSize,(page+1)*regionSize);
 const current=allWines.slice(page*wineSize,(page+1)*wineSize);
 const cats=data.categories.map(c=>({...c,wines:current.filter(w=>w.categoryId===c.id)})).filter(c=>c.wines.length);
 const columns=compact?4:8,rackColumns=compact?2:4;
 const rows=region?Math.max(1,cats.reduce((n,c)=>n+Math.ceil(c.wines.length/columns),0)):Math.max(2,Math.ceil(entries.length/rackColumns));
 const depth=region?Math.max(10,rows*4.2+2.8):Math.max(12,rows*4+3),width=rackColumns*4.7+1.2;
 const rackX=(index:number)=>(index%rackColumns-(rackColumns-1)/2)*4.7;
 const rackZ=(index:number)=>-depth/2+3+Math.floor(index/rackColumns)*4;
 // Keep large collections inside the camera clipping planes and lighting volume.
 camera.far=Math.max(100,depth*8);camera.updateProjectionMatrix();
 scene.fog=new THREE.Fog('#171714',Math.max(38,depth*3),Math.max(75,depth*7));
 const stoneColors=['#756e5e','#817966','#686456','#8e826b','#777461'];const stone=stoneColors.map(color=>new THREE.MeshStandardMaterial({color,roughness:1}));materials.push(...stone);
 if(!region){
 box(0,-.35,0,width+1,.6,depth+1,darkwood);
 for(let x=-width/2;x<width/2;x+=1)for(let z=-depth/2;z<depth/2;z+=1){const i=Math.abs(Math.round(x*13+z*7))%stone.length;box(x+.49,-.01,z+.49,.97,.13,.97,stone[i]);}
 // Individual masonry blocks with real staggered joints and a cutaway front wall.
 for(let level=0;level<3;level++){
  const span=width+.65, count=Math.ceil(span/1.4), step=span/count;
  for(let i=0;i<count;i++)box(-span/2+(i+.5)*step,level*.48+.26,-depth/2,step-.025,.44,.65,stone[(level+i)%5]);
  const sideCount=Math.ceil((depth-.65)/1.4),sideStep=(depth-.65)/sideCount;
  for(let i=0;i<sideCount;i++)for(const side of [-1,1])box(side*width/2,level*.48+.26,-depth/2+.325+(i+.5)*sideStep,.65,.44,sideStep-.025,stone[(level+i)%5]);
 }
 box(0,.13,depth/2,width+.65,.28,.65,stone[1]);
 }

 function rack(x:number,z:number,name:string,list:CellarWine[]){box(x,.2,z,3.8,.25,2.6,darkwood);for(const edge of [-1,1])box(x+edge*1.86,.65,z,.16,1.05,2.6,wood);for(const end of [-1,1])box(x,.65,z+end*1.23,3.8,1.05,.15,wood);for(let j=1;j<5;j++)box(x-1.85+j*.74,.58,z,.07,.8,2.4,wood);for(let j=0;j<5;j++){bottle(x-1.48+j*.74,.56,z+.7,data.categories.find(c=>c.id===list[j%list.length].categoryId)?.name||'');}text(name,x,1.2,z+1.25,3.5);const hit=box(x,.9,z,3.9,.5,2.8,new THREE.MeshBasicMaterial({visible:false}));hit.userData.region=name;targets.push(hit);
 const button=document.createElement('button');button.className='vc3-hit';button.setAttribute('aria-label',name);button.onclick=()=>{setWine(null);navigate.current(name);};container.appendChild(button);labels.push({element:button,point:new THREE.Vector3(x,1,z)});}
 if(!region)entries.forEach(([name,list],i)=>rack(rackX(i),rackZ(i),name,list));
 else{let row=0;for(const c of cats){text(c.name,0,.65,-depth/2+.2+row*4.2,4.2);for(let offset=0;offset<c.wines.length;offset+=columns){const zz=-depth/2+2+row*4.2;const slots=Math.min(columns,c.wines.length-offset),rw=Math.max(4.5,slots*2.15+.6);box(0,.2,zz,rw,.35,2.4,darkwood);for(const side of [-1,1])box(side*rw/2,.6,zz,.15,.8,2.4,wood);for(let j=1;j<slots;j++)box(-slots*2.15/2+j*2.15,.48,zz,.08,.6,2.3,wood);c.wines.slice(offset,offset+columns).forEach((w,j)=>{const xx=(j-(Math.min(columns,c.wines.length-offset)-1)/2)*2.15;bottle(xx,.62,zz+.45,c.name,w);text(`${w.domaine} · ${formatVintage(w.vintage)}`,xx,.46,zz+1,1.95);const button=document.createElement('button');button.className='vc3-hit';button.setAttribute('aria-label',`${w.domaine}, ${formatVintage(w.vintage)}`);button.dataset.wineId=w.id;button.onclick=(event)=>{const r=button.getBoundingClientRect();infoPoint.current={x:event.detail?event.clientX:r.right,y:event.detail?event.clientY:r.bottom};setWine(w);placeInfo();};button.onfocus=()=>{const r=button.getBoundingClientRect();infoPoint.current={x:r.right,y:r.bottom};setWine(w);};button.onblur=()=>setWine(null);container.appendChild(button);labels.push({element:button,point:new THREE.Vector3(xx,1,zz)});});row++;}}}
 // Oak barrels, iron hoops, and warm wall sconces.
 if(!region)for(const x of [-width/2+2,width/2-2]){
 const g=new THREE.Group();g.position.set(x,0,depth/2-1.5);scene.add(g);
 const profile=Array.from({length:17},(_,i)=>{const t=i/16;return new THREE.Vector2(.54+.14*Math.sin(t*Math.PI),.1+t*1.4);});
 const oak=new THREE.Mesh(new THREE.LatheGeometry(profile,32),wood);oak.castShadow=true;oak.receiveShadow=true;g.add(oak);
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2;const curve=new THREE.CatmullRomCurve3(profile.map(p=>new THREE.Vector3((p.x+.003)*Math.cos(a),p.y,(p.x+.003)*Math.sin(a))));const seam=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.008,3,false),darkwood);g.add(seam);}
 for(const t of [.12,.3,.7,.88]){const radius=.54+.14*Math.sin(t*Math.PI);const hoop=new THREE.Mesh(new THREE.CylinderGeometry(radius+.016,radius+.016,.075,32,1,true),iron);hoop.position.y=.1+t*1.4;hoop.castShadow=true;g.add(hoop);}
 const lid=new THREE.Mesh(new THREE.CylinderGeometry(.515,.515,.045,32),darkwood);lid.position.y=1.49;g.add(lid);
 for(let j=-3;j<=3;j++){const z=j*.135;const len=2*Math.sqrt(.49*.49-z*z);box(0,1.52,z,len,.025,.125,wood,g);}
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.53,.025,8,40),iron);rim.rotation.x=Math.PI/2;rim.position.y=1.53;g.add(rim);
 box(.19,1.55,.05,.1,.035,.08,darkwood,g);
 }

 scene.add(new THREE.HemisphereLight('#dce6e0','#59432d',2));const sun=new THREE.DirectionalLight('#ffe3b0',3.5);sun.position.set(-8,18,10);sun.castShadow=true;sun.shadow.mapSize.set(compact?512:1024,compact?512:1024);sun.shadow.camera.left=-16;sun.shadow.camera.right=16;sun.shadow.camera.top=Math.max(20,depth);sun.shadow.camera.bottom=-Math.max(20,depth);sun.shadow.camera.far=Math.max(100,depth*4);sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.03;scene.add(sun);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 if(!region)for(const x of [-width*.4,-width*.15,width*.15,width*.4]){const lamp=new THREE.PointLight('#ffb34b',15,7,2);lamp.position.set(x,2,-depth/2+1);scene.add(lamp);box(x,1.5,-depth/2+.4,.3,.5,.25,new THREE.MeshStandardMaterial({color:'#ffcc72',emissive:'#ffb43b',emissiveIntensity:3}));}
 // Batch static wood/stone pieces: one draw call per material instead of per block.
 scene.updateMatrixWorld(true);
 const batches=new Map<THREE.Material,THREE.Mesh[]>();
 scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry===unitBox&&o.material instanceof THREE.MeshStandardMaterial){const list=batches.get(o.material)||[];list.push(o);batches.set(o.material,list);}});
 for(const [material,meshes] of batches){const batch=new THREE.InstancedMesh(unitBox,material,meshes.length);meshes.forEach((mesh,index)=>{batch.setMatrixAt(index,mesh.matrixWorld);mesh.removeFromParent();});batch.instanceMatrix.needsUpdate=true;batch.castShadow=true;batch.receiveShadow=true;scene.add(batch);}
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let mx=0,mz=0,targetX=0,targetZ=0,lastTime=performance.now(),frame=0,renderedFrames=0,start=performance.now(),distance=25;const bounds=new THREE.Box3().setFromObject(scene);const focus=bounds.getCenter(new THREE.Vector3());const direction=new THREE.Vector3(0,1,.32).normalize();const up=new THREE.Vector3(0,direction.z,-direction.y);let flight:{start:number;name:string|null;from:THREE.Vector3;to:THREE.Vector3;look:THREE.Vector3}|null=null;
 navigate.current=(name)=>{if(flight)return;setWine(null);const index=entries.findIndex(([n])=>n===name);const point=name!==null&&index>=0?new THREE.Vector3(rackX(index),0,rackZ(index)):new THREE.Vector3();flight={start:performance.now(),name,from:camera.position.clone(),to:point.clone().add(new THREE.Vector3(0,name?7:30,name?2:10)),look:point};invalidate();};
 function pick(e:PointerEvent){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(targets,false)[0]?.object;}
 function move(e:PointerEvent){if(e.pointerType!=='mouse')return;
 const r=container.getBoundingClientRect();if(!reduced){targetX=((e.clientX-r.left)/r.width-.5)*.4;targetZ=((e.clientY-r.top)/r.height-.5)*.4;invalidate();}
 infoPoint.current={x:e.clientX,y:e.clientY};
 const button=e.target instanceof Element?e.target.closest<HTMLElement>('.vc3-hit'):null;
 const hovered=button?.dataset.wineId?current.find(w=>w.id===button.dataset.wineId):pick(e)?.userData.wine;
 setWine(hovered||null);placeInfo();renderer.domElement.style.cursor=hovered?'pointer':'default';
 }

 function click(e:PointerEvent){const o=pick(e);if(o?.userData.region){setWine(null);navigate.current(o.userData.region);}else if(o?.userData.wine)setWine(o.userData.wine);}
 container.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',click);
 function invalidate(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
 function size(){
  renderer.setSize(container.clientWidth,container.clientHeight);camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();
  const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  // Fit all eight corners in camera space, with room for the close/back and paging controls.
  const usableX=Math.max(.35,1-48/container.clientWidth),usableY=Math.max(.35,1-180/container.clientHeight);
  distance=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const p=new THREE.Vector3(x,y,z).sub(focus),near=p.dot(direction);
   distance=Math.max(distance,near+Math.abs(p.x)/(tan*camera.aspect*usableX),near+Math.abs(p.dot(up))/(tan*usableY));
  }
  distance+=1;camera.far=Math.max(100,distance*4);camera.updateProjectionMatrix();invalidate();
 }
 function leave(){targetX=0;targetZ=0;setWine(null);invalidate();}
 function restored(){setError(false);renderer.shadowMap.needsUpdate=true;invalidate();}
 function lost(){cancelAnimationFrame(frame);frame=0;setError(true);}
 function visibility(){if(document.hidden){cancelAnimationFrame(frame);frame=0;}else invalidate();}
 renderer.domElement.addEventListener('webglcontextrestored',restored);renderer.domElement.addEventListener('webglcontextlost',lost);container.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',visibility);
 const observer=new ResizeObserver(size);observer.observe(container);size();
 function draw(now:number){
  frame=0;const delta=Math.min(.05,(now-lastTime)/1000);lastTime=now;const damping=1-Math.exp(-10*delta);mx+=(targetX-mx)*damping;mz+=(targetZ-mz)*damping;const moving=Math.abs(targetX-mx)+Math.abs(targetZ-mz)>.0001;const t=reduced?1:Math.min(1,(now-start)/850),ease=1-Math.pow(1-t,3);
  camera.position.copy(focus).addScaledVector(direction,distance*(1.08-.08*ease)).add(new THREE.Vector3(mx,0,mz));camera.lookAt(focus);
  if(flight){const progress=reduced?1:Math.min(1,(now-flight.start)/1000),smooth=progress*progress*(3-2*progress);camera.position.lerpVectors(flight.from,flight.to,smooth);camera.lookAt(focus.clone().lerp(flight.look,smooth));renderer.domElement.style.opacity=String(1-Math.max(0,(progress-.65)/.35));labels.forEach(l=>{l.element.disabled=true;});if(progress===1){setWinePage(0);setRegion(flight.name);return;}}
  for(const l of labels){const p=l.point.clone().project(camera);l.element.style.left=`${(p.x*.5+.5)*container.clientWidth}px`;l.element.style.top=`${(-p.y*.5+.5)*container.clientHeight}px`;}
  try{renderer.render(scene,camera);}catch{setError(true);return;}renderedFrames++;
  if(process.env.NODE_ENV==='development')renderer.domElement.dataset.sceneStats=JSON.stringify({frames:renderedFrames,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
  if(t<1||flight||moving)invalidate();
 }
 if(document.activeElement===document.body||document.activeElement===dialog.current)dialog.current?.querySelector<HTMLElement>(region?'.vc3-back':'.vc3-close')?.focus({preventScroll:true});
 invalidate();

 return()=>{cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextrestored',restored);renderer.domElement.removeEventListener('webglcontextlost',lost);document.removeEventListener('visibilitychange',visibility);container.removeEventListener('pointerleave',leave);container.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',click);const geometries=new Set<THREE.BufferGeometry>([unitBox,bodyGeometry,labelGeometry,foilGeometry]);const usedMaterials=new Set<THREE.Material>(materials);scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>usedMaterials.add(m));}});geometries.forEach(g=>g.dispose());usedMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.dispose();renderer.dispose();container.replaceChildren();};
 },[data,region,compact,page,collection]);
 return createPortal(<div ref={dialog} className="vc3" role="dialog" aria-modal="true" aria-label="Cave virtuelle" tabIndex={-1}><div className="vc3-scene" ref={host}/><button className="vc3-close" onClick={onClose}>Fermer ×</button>{region&&<button className="vc3-back" onClick={()=>navigate.current(null)} aria-label="Revenir à la cave"><ArrowLeft size={19}/><span>La cave</span></button>}{pageCount>1&&<nav className="vc3-paging" aria-label={region?"Pages des vins":"Pages des régions"}><button type="button" aria-label="Page précédente" disabled={page===0} onClick={()=>changePage(page-1)}><ChevronLeft size={19}/></button><select aria-label="Choisir une page" value={page} onChange={event=>changePage(Number(event.target.value))}>{Array.from({length:pageCount},(_,index)=><option key={index} value={index}>{index*pageSize+1}–{Math.min(total,(index+1)*pageSize)} / {total} {region?"vins":"régions"}</option>)}</select><button type="button" aria-label="Page suivante" disabled={page===pageCount-1} onClick={()=>changePage(page+1)}><ChevronRight size={19}/></button></nav>}{error&&<p className="vc3-error">Le rendu 3D n’est pas disponible dans ce navigateur.</p>}{wine&&<aside ref={infoRef} className="vc3-info vc3-info--cursor" role="tooltip"><button onClick={()=>setWine(null)} aria-label="Masquer la fiche">×</button><h2>{wine.domaine}</h2><p>{wine.appellation} · {formatVintage(wine.vintage)}</p>{wine.cuvee&&<p>{wine.cuvee}</p>}<p>{wine.quantity} bouteilles{wine.purchasePrice?` · ${wine.purchasePrice} €`:''}</p></aside>}</div>,document.body);
}
