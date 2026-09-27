/* Optional observed vehicle counts; no synthetic traffic or routing changes. */
(()=>{'use strict';
const bands=[['車流較少','#26975a'],['車流中等','#e6b62c'],['車流較多','#d74742'],['無法分級','#7b848b']];
function classify(row,now=Date.now()){
 const age=now-Date.parse(row.time),v=row.flowRate;
 return row.state==='ok'&&Number.isFinite(age)&&age>=-60000&&age<=300000&&Number.isFinite(v)&&v>=0?bands[v<5?0:v<10?1:2]:bands[3];
}
function mount(map,control){
 const layer=L.layerGroup(),legend=L.control({position:'bottomleft'});let timer,controller,generation=0,rows=[],status;
 legend.onAdd=()=>{const div=L.DomUtil.create('div','chiayi-traffic-legend');div.innerHTML='<strong>即時車流（VD）</strong><p>每車道／資料觀測週期</p>'+bands.map(([label,color])=>`<div><i style="background:${color}"></i>${label}</div>`).join('')+'<p>綠 &lt; 5、黃 5–未滿 10、紅 ≥ 10 輛。此為介面比較門檻，非官方壅塞標準；不同週期不宜直接比較。</p><p data-status role="status"></p><button type="button">關閉車流圖層</button><details><summary>資訊來源與限制</summary><p>交通部 TDX 嘉義市 VD。每分鐘查詢，超過五分鐘或資料不足顯示灰色。圓點取各方向平均每車道流量較高值，非車速或道路密度。沒有測站不代表車少；不影響路線解算。</p></details>';status=div.querySelector('[data-status]');div.querySelector('button').onclick=()=>map.removeLayer(layer);L.DomEvent.disableClickPropagation(div);L.DomEvent.disableScrollPropagation(div);return div;};
 function render(){layer.clearLayers();for(const row of rows){const [label,color]=classify(row);const div=document.createElement('div');div.textContent=`${row.road} · ${label} · ${label==='無法分級'?'資料不足／過期':row.flowRate+' 輛／車道／觀測週期'} · ${row.time||'時間未提供'}`;L.circleMarker([row.lat,row.lng],{radius:8,color:'#fff',weight:2,fillColor:color,fillOpacity:.95}).bindPopup(div).addTo(layer);}}
 async function load(){if(!map.hasLayer(layer)||document.hidden||controller)return;const id=++generation;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),25000);status.textContent='讀取車流…';try{const r=await fetch(window.CHIAYI_COMMUNITY_CONFIG.apiBase+'/traffic/chiayi',{signal:controller.signal,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.detail||'無法取得車流');if(id!==generation)return;rows=data.stations||[];render();status.textContent=rows.length?`${rows.length} 個測站；每分鐘更新`:'目前資料源沒有嘉義測站';}catch(e){if(id===generation){render();status.textContent=e.name==='AbortError'?'車流讀取逾時':e.message;}}finally{clearTimeout(timeout);if(id===generation){controller=null;if(map.hasLayer(layer)&&!document.hidden)timer=setTimeout(load,60000);}}}
 const stop=()=>{generation++;clearTimeout(timer);controller?.abort();controller=null;};
 layer.on('add',()=>{legend.addTo(map);load();});layer.on('remove',()=>{stop();legend.remove();layer.clearLayers();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(map.hasLayer(layer)){render();load();}});control.addOverlay(layer,'即時車流（VD）');
 return layer;
}
window.ChiayiTraffic={mount,classify};
})();
