(()=>{'use strict';
let layer=null,timer=null,enabled=false,busy=false,status=null,last=0,generation=0;
const states={ok:'觀測有效',stale:'資料過期',fault:'設備異常',missing:'缺少有效觀測'};
function clear(){enabled=false;generation++;clearTimeout(timer);if(layer){map.removeLayer(layer);layer.clearLayers();}if(status?.isConnected)status.textContent='已關閉車流圖層';}
function schedule(){clearTimeout(timer);if(enabled&&!document.hidden)timer=setTimeout(load,60000);}
async function load(){
 if(busy||!enabled||document.hidden)return;
 if(Date.now()-last<15000){schedule();return;}
 busy=true;last=Date.now();const id=++generation;
 if(status?.isConnected)status.textContent='讀取車流中…';
 try{const response=await fetch(window.CHIAYI_COMMUNITY_CONFIG.apiBase+'/traffic/chiayi',{signal:AbortSignal.timeout(30000),cache:'no-store'});const data=await response.json();if(id!==generation||!enabled)return;if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'車流暫時無法取得');layer??=L.layerGroup();layer.clearLayers();layer.addTo(map);let count=0;
 for(const row of data.stations||[]){const age=Date.now()-Date.parse(row.time);const valid=row.state==='ok'&&Number.isFinite(age)&&age>=-60000&&age<=300000;const state=valid?'ok':row.state==='ok'?'stale':row.state;
 const box=document.createElement('div');const title=document.createElement('strong');title.textContent=row.road;box.append(title);const note=document.createElement('p');note.textContent=(states[state]||'資料不足')+(row.partial?' · 部分車道':'')+'\n觀測時間：'+(row.time||'未提供');box.append(note);if(valid){const speed=document.createElement('p');speed.textContent='觀測車速 '+row.speed+' km/h（車流加權）';box.append(speed);count++;}
 L.circleMarker([row.lat,row.lng],{radius:8,color:'#fff',weight:2,fillColor:valid?'#397bad':'#858b8c',fillOpacity:.9}).bindPopup(box).addTo(layer);}
 if(status?.isConnected)status.textContent=data.stations?.length?`共 ${data.stations.length} 個測站，${count} 個有有效車速。藍色為有效觀測，灰色為過期或無資料。`:'目前嘉義資料源沒有測站資料。';
 }catch(e){if(id===generation&&enabled){if(layer)layer.clearLayers();if(status?.isConnected)status.textContent=e.name==='TimeoutError'?'車流讀取逾時，稍後重試。':e.message;}}
 finally{busy=false;schedule();}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);if(layer)layer.clearLayers();}else if(enabled)load();});
window.ChiayiTraffic={open(panel){const p=panel('🚦 嘉義即時交通','');const note=document.createElement('p');note.className='v2-note';note.textContent='車輛偵測器的測站觀測，非每條道路都有資料。顏色表示資料有效性，不代表壅塞程度，也不改變步行路線。開啟後約每分鐘更新，背景分頁暫停。';p.append(note);status=document.createElement('p');status.setAttribute('role','status');status.textContent=enabled?'車流圖層已開啟。':'尚未開啟車流。';p.append(status);for(const [label,fn]of [['開啟／更新車流',()=>{enabled=true;load();}],['關閉車流',clear]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;p.append(b);}const a=document.createElement('a');a.href='https://tdx.transportdata.tw/';a.target='_blank';a.rel='noopener';a.textContent='資料來源：交通部 TDX';p.append(a);}};
})();
