/* Navigation-only presentation and conservative GPS matching. No location storage. */
(function(global){
 'use strict';
 const rad=Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const angle=v=>((v%360)+360)%360;
 const delta=(a,b)=>((b-a+540)%360)-180;
 const distance=(a,b)=>Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos((a[0]+b[0])/2*rad));
 const bearing=(a,b)=>angle(Math.atan2((b[1]-a[1])*Math.cos((a[0]+b[0])/2*rad),b[0]-a[0])/rad);
 function validFix(position,now=Date.now()){
  const c=position?.coords,t=position?.timestamp;
  return !!c&&Number.isFinite(c.latitude)&&Math.abs(c.latitude)<=90&&Number.isFinite(c.longitude)&&Math.abs(c.longitude)<=180&&Number.isFinite(c.accuracy)&&c.accuracy>0&&Number.isFinite(t)&&now-t<=15000&&t<=now+3000;
 }
 function headingFilter(){
  let previous=null,heading=null,pending=null;
  return {update(position,mode='walk'){
   const c=position.coords,p=[c.latitude,c.longitude],now=position.timestamp;
   const limit=mode==='scooter'?35:mode==='bike'?15:4.5;
   const elapsed=previous?(now-previous.time)/1000:0,moved=previous?distance(p,previous.point):0;
   let reliable=false,target=null;
   if(c.accuracy<=25&&(!previous||elapsed>0&&elapsed<=20)){
    const moving=Number.isFinite(c.speed)?c.speed>=.7&&c.speed<=limit:previous&&elapsed>0&&moved/elapsed>=.7&&moved/elapsed<=limit;
    if(moving&&(!previous||moved>=3&&moved/elapsed<=limit*2)){
     if(Number.isFinite(c.heading)&&c.heading>=0&&c.heading<360)target=c.heading;
     else if(previous&&moved>=Math.max(8,c.accuracy*.65))target=bearing(previous.point,p);
    }
   }
   if(target!==null){
    if(heading!==null&&Math.abs(delta(heading,target))>100){
     if(pending!==null&&Math.abs(delta(pending,target))<25)reliable=true;
     pending=target;
    }else{reliable=true;pending=null;}
    if(reliable)heading=heading===null?target:angle(heading+clamp(delta(heading,target)*.4,-30,30));
   }else pending=null;
   if(!previous||moved>=Math.max(8,c.accuracy*.65)||(reliable&&moved>=3)||elapsed>20)previous={point:p,time:now};
   return {heading,reliable};
  }};
 }
 function matcher(coords,mode='walk'){
  const chain=[0];for(let i=1;i<coords.length;i++)chain.push(chain.at(-1)+distance(coords[i-1],coords[i]));
  let last=null;
  return {update(position,ordered){
   const c=position.coords,p=[c.latitude,c.longitude],raw={lat:c.latitude,lng:c.longitude};
   if(c.accuracy>25)return {point:raw,snapped:false,reason:'weak'};
   const threshold=clamp(c.accuracy*1.2,12,25);
   if(ordered){
    const n=ordered.nearest;
    if(ordered.status!=='walking'||!n)return {point:raw,snapped:false,reason:ordered.status};
    const point=n.latlng,off=distance(p,[point.lat,point.lng]);
    return off<=threshold?{point,snapped:true,nearest:{...n,distance:off},progress:ordered.progress}:{point:raw,snapped:false,reason:'offroute'};
   }
   const sx=111195*Math.cos(p[0]*rad),sy=111195,dt=last?(position.timestamp-last.time)/1000:0;
   const speedLimit=mode==='scooter'?35:mode==='bike'?15:4.5;
   const window=last?clamp(Math.max(0,dt)*speedLimit+20,25,mode==='walk'?100:400):Infinity;
   const choices=[];
   for(let i=0;i<coords.length-1;i++){
    if(last&&(chain[i+1]<last.progress-35||chain[i]>last.progress+window))continue;
    const a=coords[i],b=coords[i+1],ax=(a[1]-p[1])*sx,ay=(a[0]-p[0])*sy,dx=(b[1]-a[1])*sx,dy=(b[0]-a[0])*sy;
    const t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1),off=Math.hypot(ax+t*dx,ay+t*dy),progress=chain[i]+t*(chain[i+1]-chain[i]);
    if(off>threshold||last&&(progress<last.progress-35||progress>last.progress+window))continue;
    const travel=Number.isFinite(c.speed)&&c.speed>=.7&&Number.isFinite(c.heading)?Math.abs(delta(c.heading,bearing(a,b))):null;
    if(travel!==null&&travel>110)continue;
    choices.push({index:i,t,distance:off,progress,latlng:{lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t},score:off+(last?Math.abs(progress-last.progress)*.025:0)+(travel??0)*.035});
   }
   choices.sort((a,b)=>a.score-b.score);const best=choices[0];
   if(!best)return {point:raw,snapped:false,reason:'offroute'};
   // An uninitialized crossing with equally plausible, distant route occurrences
   // is not enough evidence to choose one. Show GPS until motion disambiguates it.
   if(!last&&choices.some(n=>Math.abs(n.progress-best.progress)>60&&n.score-best.score<3))return {point:raw,snapped:false,reason:'ambiguous'};
   last={progress:best.progress,time:position.timestamp};best.remaining=Math.max(0,chain.at(-1)-best.progress);
   return {point:best.latlng,snapped:true,nearest:best,progress:best.progress};
  }};
 }
 function create({map,getLayers,getOpacityInputs=()=>[],getAnchor,onStatus=()=>{},onFollowing=()=>{}}){
  let active=false,following=true,mode='heading',snapshot=null,match=null,motion=null,lastStamp=-Infinity,lastSample=null,travelMode='walk';
  function camera(zoom=map.getZoom()){
   if(!active||!following||!lastSample||lastSample.accuracy>80)return;
   const size=map.getSize(),anchor=getAnchor?getAnchor(size):{x:size.x/2,y:size.y*.70},b=(map.getBearing?.()||0)*rad;
   const dx=anchor.x-size.x/2,dy=anchor.y-size.y/2;
   const world={x:Math.cos(b)*dx+Math.sin(b)*dy,y:-Math.sin(b)*dx+Math.cos(b)*dy};
   const point=map.project(lastSample.point,zoom);
   map.setView(map.unproject([point.x-world.x,point.y-world.y],zoom),zoom,{animate:false});
  }
  function orient(){
   if(!active||!following)return;
   if(mode==='north')map.setBearing?.(0);
   else if(Number.isFinite(lastSample?.heading))map.setBearing?.(angle(-lastSample.heading));
  }
  function status(){
   const value=!following?'已暫停跟隨，按「回到目前位置」恢復':!lastSample?'等待定位':lastSample.reason==='stale'?'定位已中斷，等待新位置':lastSample.snapped?'定位已吸附路線':lastSample.accuracy>25?'定位較不準，顯示 GPS 位置':'尚未吸附路線，顯示 GPS 位置';
   const directionNote=following&&mode==='heading'&&!Number.isFinite(lastSample?.heading)?'；請向前走一段，確認方向後自動旋轉':'';
   onStatus(value+directionNote,{mode,following,snapped:!!lastSample?.snapped});
  }
  function pause(){if(!active)return;following=false;map.stop?.();map.stopHeadingUp?.();onFollowing(false);status();}
  map.on('dragstart',pause);
  // The gesture handler emits rotatestart; automatic setBearing only emits rotate.
  // Listen to the former so GPS-driven rotation never pauses itself.
  map.on('rotatestart',pause);
  map.on('resize',()=>{if(active)camera();});
  return {
   start(coords,modeOfTravel='walk'){
    if(active)return;active=true;following=true;travelMode=modeOfTravel;lastStamp=-Infinity;lastSample=null;
    match=matcher(coords,travelMode);motion=headingFilter();
    snapshot={layers:getLayers().map(layer=>({layer,on:map.hasLayer(layer)})),inputs:getOpacityInputs().map(input=>({input,value:input.value}))};
    for(const item of snapshot.layers)if(item.on)map.removeLayer(item.layer);
    map.stopHeadingUp?.();map.setBearing?.(0);onFollowing(true);status();
   },
   replaceRoute(coords){match=matcher(coords,travelMode);lastSample=null;lastStamp=-Infinity;},
   update(position,ordered,now=Date.now()){
    if(!active)return null;
    if(!validFix(position,now)||position.timestamp<=lastStamp){if(lastSample){lastSample={...lastSample,reason:'stale'};status();}return null;}
    lastStamp=position.timestamp;const first=!lastSample;
    const direction=motion.update(position,travelMode),sample=match.update(position,ordered);
    lastSample={...sample,actual:{lat:position.coords.latitude,lng:position.coords.longitude},accuracy:position.coords.accuracy,heading:direction.heading,headingReliable:direction.reliable};
    orient();camera(first?Math.max(map.getZoom(),18):map.getZoom());status();return lastSample;
   },
   toggle(){mode=mode==='heading'?'north':'heading';following=true;onFollowing(true);if(mode==='north')map.setBearing?.(0);else orient();camera();status();return mode;},
   recenter(){following=true;onFollowing(true);orient();camera(Math.max(map.getZoom(),18));status();},
   refresh:camera,pause,
   stop(){
    if(!active)return;active=false;map.stopHeadingUp?.();map.setBearing?.(0);
    for(const {input,value}of snapshot.inputs)if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
    for(const {layer,on}of snapshot.layers){if(on&&!map.hasLayer(layer))map.addLayer(layer);else if(!on&&map.hasLayer(layer))map.removeLayer(layer);}
    snapshot=null;lastSample=null;match=null;motion=null;onStatus('',{mode,following:true,snapped:false});
   },
   state:()=>({active,following,mode,sample:lastSample})
  };
 }
 const api={create,matcher,headingFilter,validFix,distance,bearing,delta};if(typeof module!=='undefined')module.exports=api;else global.TreeNavigationView=api;
})(globalThis);
