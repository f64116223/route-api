/* Local route library and opt-in account operations. No analytics or automatic uploads. */
(()=>{'use strict';
const cfg=window.CHIAYI_COMMUNITY_CONFIG,R=window.ChiayiRecords;
const KEY='chiayi_favorites_v2',HISTORY='chiayi_history_enabled';
let current=null,auth=null,sdk=null,profile=null,initializing=null,accountGeneration=0;
let hostPanel=null,closePanel=null;
const el=(tag,text,parent,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;if(parent)parent.append(x);return x;};
const button=(text,parent,fn)=>{const b=el('button',text,parent);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{b.disabled=false;}};return b;};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
function save(key,v){try{localStorage.setItem(key,JSON.stringify(v));}catch{throw Error('此瀏覽器無法儲存，請確認未封鎖網站儲存空間');}}
function favorites(){const saved=read(KEY,[]);return (Array.isArray(saved)?saved:[]).filter(r=>{try{R.favorite(r);return true;}catch{return false;}}).slice(0,30);}
function addFavorite(record,title){const rows=favorites();if(rows.length>=30)throw Error('收藏已達 30 筆，請先刪除不需要的項目');const r=R.favorite({...record,id:crypto.randomUUID(),title});rows.unshift(r);save(KEY,rows);}
function migrate(){if(localStorage.getItem(KEY)!==null)return;const rows=read('chiayi_favorites',[]);const result=[];for(const row of rows){try{result.push(R.favorite({id:crypto.randomUUID(),title:'舊版收藏（請確認交通方式）',mode:'walk',extra_minutes:null,start:row.start,end:row.end}));}catch{}}if(result.length)save(KEY,result.slice(0,30));}
try{migrate();}catch{}
let dbPromise;
function db(){return dbPromise??=new Promise((resolve,reject)=>{const q=indexedDB.open('chiayi_route_history',1);q.onupgradeneeded=()=>q.result.createObjectStore('routes',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('無法開啟本機歷史紀錄'));});}
async function historyStore(mode,run){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('routes',mode);let value;run(tx.objectStore('routes'),v=>value=v);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(Error('歷史紀錄儲存失敗，可能空間不足'));tx.onabort=tx.onerror;});}
async function histories(){return (await historyStore('readonly',(s,done)=>{const q=s.getAll();q.onsuccess=()=>done(q.result);})).sort((a,b)=>b.at-a.at);}
async function capture(detail){current=structuredClone(detail);if(read(HISTORY,true)!==true||detail.restored)return;try{await historyStore('readwrite',s=>s.put({...detail,id:crypto.randomUUID(),at:Date.now()}));const rows=await histories();await historyStore('readwrite',s=>rows.slice(30).forEach(r=>s.delete(r.id)));}catch(e){console.warn(e.message);}}
window.addEventListener('chiayi-route-ready',e=>capture(e.detail));
window.addEventListener('DOMContentLoaded',()=>document.getElementById('resetBtn')?.addEventListener('click',()=>{current=null;}));
function description(r){return `${r.mode==='bike'?'自行車':'步行'} · A ${r.start.lat.toFixed(5)}, ${r.start.lng.toFixed(5)} → B ${r.end.lat.toFixed(5)}, ${r.end.lng.toFixed(5)}${r.extra_minutes?' · 最多多走 '+r.extra_minutes+' 分鐘':''}`;}
function panel(title){const p=hostPanel(title,'');p.classList.add('community-body');return p;}
async function library(view='favorite'){
 const p=panel(view==='history'?'🕘 歷史紀錄':'⭐ 我的收藏');el('p','紀錄保存在此瀏覽器，最多各 30 筆；不登入也能使用。',p,'v2-note');
 if(current){const name=el('input',undefined,p);name.placeholder='為目前路線取個名稱';name.maxLength=80;name.setAttribute('aria-label','收藏名稱');button('收藏目前路線',p,()=>{addFavorite(current.settings,name.value.trim()||'我的嘉義路線');return library();});}
 el('h3','我的收藏',p);
 const rows=favorites();if(!rows.length)el('p','尚無收藏，請先規劃一條路線。',p);
 for(const row of rows){const card=el('section',undefined,p,'community-card');const name=el('input',undefined,card);name.value=row.title;name.maxLength=80;name.setAttribute('aria-label','修改收藏名稱');el('p',description(row),card);const actions=el('div',undefined,card,'v2-actions');button('儲存名稱',actions,()=>{const list=favorites();const i=list.findIndex(r=>r.id===row.id);if(i<0)throw Error('收藏已移除');list[i]=R.favorite({...list[i],title:name.value});save(KEY,list);});button('重新規劃',actions,()=>{window.ChiayiRouteBridge.load(row);closePanel();});button('分享',actions,()=>share(row));button('刪除',actions,()=>{save(KEY,favorites().filter(r=>r.id!==row.id));return library();});}
 if(view==='history')for(const node of p.children)node.hidden=true;
 if(view!=='history')return;
 el('h3','最近規劃',p);const list=el('div','讀取中…',p);
 try{const rows=await histories();if(!list.isConnected)return;list.replaceChildren();if(!rows.length)el('p','尚無歷史紀錄。',list);for(const row of rows){const card=el('section',undefined,list,'community-card');el('strong',new Date(row.at).toLocaleString('zh-TW'),card);el('p',description(row.settings),card);const actions=el('div',undefined,card,'v2-actions');button('載入當時結果',actions,()=>{window.ChiayiRouteBridge.load(row.settings,row.data);closePanel();});button('重新規劃',actions,()=>{window.ChiayiRouteBridge.load(row.settings);closePanel();});button('加入收藏',actions,()=>{addFavorite(row.settings,'歷史路線 '+new Date(row.at).toLocaleDateString('zh-TW'));return library();});button('刪除',actions,async()=>{await historyStore('readwrite',s=>s.delete(row.id));await library();});}}catch(e){list.textContent=e.message;}
}
function share(record=current?.settings){
 const p=panel('🔗 分享路線');if(!record){el('p','請先完成路徑規劃。',p);return;}
 const r=R.clean(record);el('p',description(r),p);el('p','連結包含起終點座標、交通方式與步行偏好。取得連結的人可查看這些位置；對方會重新規劃，路線可能不同。',p,'v2-note');
 const url=new URL(location.pathname,location.origin);url.hash='route='+R.encode(r);
 const box=el('textarea',undefined,p);box.readOnly=true;box.rows=4;box.value=url.href;box.setAttribute('aria-label','路線分享連結');
 const status=el('p','',p);button('複製分享連結',p,async()=>{try{await navigator.clipboard.writeText(url.href);status.textContent='已複製連結';}catch{box.focus();box.select();status.textContent='請手動複製上方已選取的連結';}});
 if(navigator.share)button('開啟裝置分享',p,async()=>{try{await navigator.share({title:'嘉義綠色路線',url:url.href});}catch(e){if(e.name!=='AbortError')throw Error('無法開啟分享，請改用複製連結');}});
}
function receiveShare(){if(!location.hash.startsWith('#route='))return;const p=panel('🔗 收到分享路線');try{const r=R.decode(location.hash.slice(7));el('p',description(r),p);el('p','確認後會將這組起終點交給路徑服務重新規劃。',p);button('以這組起終點規劃',p,()=>{window.ChiayiRouteBridge.load(r);history.replaceState(null,'',location.pathname+location.search);closePanel();});}catch(e){el('p',e.message,p);}}
async function request(path,options={}){
 const user=auth?.currentUser;if(!user)throw Error('請先使用 Google 帳號登入');
 const uid=user.uid,token=await user.getIdToken();
 const response=await fetch(cfg.apiBase+'/community'+path,{method:options.method||'GET',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>({}));if(auth?.currentUser?.uid!==uid)throw Error('帳號已切換，請重新操作');if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'服務暫時無法使用，請稍後再試');return data;
}
function isConfigured(){return ['apiKey','authDomain','projectId','appId'].every(k=>cfg.firebase[k]);}
async function initialize(){
 if(!isConfigured())throw Error('Google 登入尚未開放，請先以訪客使用本機收藏。');
 if(initializing)return initializing;
 initializing=(async()=>{
  const [app,mod]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js')]);
  sdk=mod;auth=sdk.getAuth(app.initializeApp(cfg.firebase,'chiayi-community'));
  await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  await new Promise(resolve=>{let first=true;sdk.onAuthStateChanged(auth,async user=>{const generation=++accountGeneration;profile=null;if(user){try{const value=await request('/me');if(generation===accountGeneration)profile=value;}catch{}}if(first){first=false;resolve();}window.dispatchEvent(new Event('chiayi-account-change'));});});
 })().catch(e=>{initializing=null;throw e;});return initializing;
}
async function account(){
 const p=panel('👤 帳號與隱私');el('p','不登入也能規劃路線、收藏與分享。登入不會自動上傳紀錄。',p,'v2-note');
 const status=el('p',isConfigured()?'正在確認登入狀態…':'Google 登入尚未開放；本機功能可正常使用。',p);status.setAttribute('role','status');
 const actions=el('div',undefined,p,'v2-actions');
 if(isConfigured()){try{await initialize();if(auth.currentUser){try{profile=await request('/me');}catch{profile=null;}}if(!p.isConnected)return;status.textContent=auth.currentUser?'已登入：'+auth.currentUser.email:'目前為訪客';if(auth.currentUser){button('登出',actions,async()=>{await sdk.signOut(auth);profile=null;await account();});button('雲端備份',actions,backup);button('刪除登入帳號',actions,async()=>{if(!confirm('刪除登入帳號前，請先刪除雲端備份。路況回報依保留政策處理。本機收藏不受影響。確定繼續？'))return;const old=await request('/backup');if(old.data)throw Error('請先到雲端備份刪除備份內容');try{await sdk.deleteUser(auth.currentUser);}catch(e){if(e.code==='auth/requires-recent-login')throw Error('請先登出並重新登入，再刪除帳號');throw e;}await account();});if(profile?.admin)button('路況管理後台',actions,admin);}else button('使用 Google 登入',actions,async()=>{try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());await account();}catch(e){if(e.code?.includes('popup-closed'))return;throw Error('登入未完成，請確認授權網域；內嵌瀏覽器請改用 Chrome 或 Safari。');}});}catch(e){status.textContent=e.message;}}
 el('h3','本機隱私設定',p);const label=el('label',undefined,p,'community-check');const check=el('input',undefined,label);check.type='checkbox';check.checked=read(HISTORY,true)===true;el('span','在此裝置保留最近 30 次規劃結果',label);check.onchange=()=>{try{save(HISTORY,check.checked);}catch(e){alert(e.message);check.checked=!check.checked;}};
 button('清除本機歷史紀錄',p,async()=>{if(confirm('清除這台裝置的歷史紀錄？收藏仍會保留。')){await historyStore('readwrite',s=>s.clear());status.textContent='已清除本機歷史紀錄';}});
 button('清除本機收藏',p,()=>{if(confirm('清除這台裝置的所有收藏？雲端備份不受影響。')){save(KEY,[]);localStorage.removeItem('chiayi_favorites');status.textContent='已清除本機收藏';}});
 el('p','本網站不傳送使用統計。Google 登入使用識別碼、名稱及電子郵件，不讀取 Gmail 或雲端硬碟。登入狀態僅保留在本次瀏覽工作階段。路徑查詢會傳送起終點給路徑服務；定位導航不儲存行走軌跡。',p);
 el('p','只有按下備份才上傳收藏的名稱、起終點與偏好，歷史路線不備份。回報內容僅供管理員查看，保存期限目標為 90 天。',p);
}
async function backup(){
 const p=panel('☁️ 雲端備份');el('p','手動備份本機收藏（最多 30 筆）。包含位置與名稱，不包含歷史路線或行走軌跡。',p,'v2-note');
 const status=el('p','讀取雲端版本中…',p);try{await initialize();const snapshot=await request('/backup');if(!p.isConnected)return;const uid=auth.currentUser.uid;status.textContent=snapshot.data?'雲端收藏 '+snapshot.data.favorites.length+' 筆 · '+snapshot.updatedAt:'目前沒有雲端備份';const consent=el('label',undefined,p,'community-check'),check=el('input',undefined,consent);check.type='checkbox';el('span','我同意將本機收藏中的位置與名稱上傳至我的雲端備份',consent);const owner=()=>{if(auth?.currentUser?.uid!==uid)throw Error('帳號已變更，請重新開啟備份');};button('以本機收藏覆蓋雲端',p,async()=>{owner();if(!check.checked)throw Error('請先勾選備份同意');if(snapshot.data&&!confirm('以本機收藏取代現有雲端備份？'))return;await request('/backup',{method:'POST',body:{consent:true,revision:snapshot.revision,data:{version:1,favorites:favorites().map(R.favorite)}}});await backup();});if(snapshot.data){button('還原雲端收藏至此裝置',p,()=>{owner();const rows=snapshot.data.favorites.map(R.favorite);if(rows.length>30)throw Error('雲端收藏格式不正確');if(!confirm('以雲端收藏取代這台裝置的收藏？'))return;save(KEY,rows);status.textContent='已還原 '+rows.length+' 筆收藏';});button('刪除雲端備份',p,async()=>{owner();if(!confirm('刪除雲端備份內容？本機收藏仍會保留。'))return;await request('/backup/delete',{method:'POST',body:{consent:true,revision:snapshot.revision}});await backup();});}}catch(e){status.textContent=e.message;button('前往帳號登入',p,account);}
}
const categories={construction:'施工',blocked:'道路封閉',obstacle:'通行障礙',flood:'積水',other:'其他'};
async function report(){
 const p=panel('⚠️ 路況回報');button('我的回報與處理進度',p,()=>myReports());el('p','請描述位置與狀況，管理員會在後台查看。這不是緊急通報管道。請勿填寫他人個資。',p,'v2-note');
 const form=el('form',undefined,p);el('label','回報類型',form);const type=el('select',undefined,form);for(const [k,v]of Object.entries(categories)){const o=el('option',v,type);o.value=k;}type.setAttribute('aria-label','回報類型');
 el('label','發生位置／路口',form);const locationInput=el('input',undefined,form);locationInput.required=true;locationInput.minLength=2;locationInput.maxLength=160;locationInput.setAttribute('aria-label','發生位置');locationInput.placeholder='例如：民生北路與中山路口';
 el('label','狀況說明',form);const note=el('textarea',undefined,form);note.required=true;note.minLength=5;note.maxLength=1000;note.rows=5;note.setAttribute('aria-label','狀況說明');
 const pointLabel=el('label',undefined,form,'community-check'),pointCheck=el('input',undefined,pointLabel);pointCheck.type='checkbox';const point=window.ChiayiRouteBridge.center();el('span',`附上目前地圖中心座標（${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}）`,pointLabel);
 const label=el('label',undefined,form,'community-check'),consent=el('input',undefined,label);consent.type='checkbox';consent.required=true;el('span','同意將回報內容及勾選的位置交給研究團隊處理',label);
 const status=el('p','回報需 Google 登入，以限制重複與大量送出。',form);status.setAttribute('role','status');const submit=el('button','送出回報',form);submit.type='submit';let payload=null;
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await initialize();if(!auth.currentUser)throw Error('請先從下方「登入」按鈕登入，再回到表單');const content={category:type.value,location:locationInput.value.trim(),note:note.value.trim(),point:pointCheck.checked?R.point(point):null,consent:true};const signature=JSON.stringify(content);if(payload?.signature!==signature||payload?.owner!==auth.currentUser.uid)payload={id:crypto.randomUUID(),signature,owner:auth.currentUser.uid,content};const result=await request('/reports',{method:'POST',body:{id:payload.id,...payload.content}});status.textContent='已收到回報，編號：'+result.id;for(const input of form.elements)input.disabled=true;}catch(e){status.textContent=e.message;submit.disabled=false;}};
 button('Google 登入（保留表單內容）',p,async()=>{await initialize();if(!auth.currentUser)await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());status.textContent='已登入，可繼續填寫並送出回報';});
}
async function admin(cursor=null){
 const p=panel('🛠️ 路況管理後台');button('新回報通知',p,()=>notifications('admin'));const status=el('p','確認管理權限中…',p);try{await initialize();const data=await request('/admin/reports'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!p.isConnected)return;status.textContent=data.rows.length?'本頁 '+data.rows.length+' 筆回報':'目前沒有回報';button('重新整理／第一頁',p,()=>admin());for(const row of data.rows){const card=el('section',undefined,p,'community-card');el('h3',(categories[row.category]||row.category)+' · '+row.location,card);el('p',row.note,card);el('small',new Date(row.created_at).toLocaleString('zh-TW')+' · '+row.id,card);if(row.point)el('p',`座標：${row.point.lat}, ${row.point.lng}`,card);const select=el('select',undefined,card);select.setAttribute('aria-label','回報處理狀態');for(const [v,t]of Object.entries({pending:'待處理',reviewing:'處理中',resolved:'已處理',dismissed:'不採納'})){const o=el('option',t,select);o.value=v;}select.value=row.status;const reply=el('textarea',undefined,card);reply.value=row.reply||'';reply.maxLength=500;reply.placeholder='內部處理備註';reply.setAttribute('aria-label','內部處理備註');const publicReply=el('textarea',undefined,card);publicReply.value=row.public_reply||'';publicReply.maxLength=500;publicReply.placeholder='回覆回報者（對方可見）';publicReply.setAttribute('aria-label','回覆回報者');const state=el('p','',card);button('儲存處理結果',card,async()=>{await request('/admin/reports/'+row.id,{method:'PATCH',body:{status:select.value,reply:reply.value,public_reply:publicReply.value}});state.textContent='已儲存';});}if(data.next)button('下一頁',p,()=>admin(data.next));}catch(e){status.textContent=e.message;button('帳號登入',p,account);}
}
const statusLabels={pending:'待處理',reviewing:'處理中',resolved:'已處理',dismissed:'不採納'};
async function myReports(cursor=null){
 const p=panel('📋 我的回報');const message=el('p','讀取中…',p);try{await initialize();const data=await request('/my-reports'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!p.isConnected)return;message.textContent='每頁最多 50 筆，僅顯示你的回報。';for(const row of data.rows){const card=el('section',undefined,p,'community-card');el('h3',row.location+' · '+(statusLabels[row.status]||row.status),card);el('p',row.note,card);el('small',new Date(row.created_at).toLocaleString('zh-TW'),card);el('p','處理回覆：'+(row.public_reply||'尚無公開回覆'),card);}if(!data.rows.length)message.textContent='尚無回報';if(data.next)button('下一頁',p,()=>myReports(data.next));}catch(e){message.textContent=e.message;button('帳號登入',p,account);}
}
async function notifications(audience='user',cursor=null){
 const p=panel('🔔 站內通知');el('p','網站開啟且登入時約每分鐘檢查。關閉網站後不會推播；通知從新版部署後開始產生。',p,'v2-note');const message=el('p','讀取中…',p);
 try{await initialize();profile=await request('/me');if(!p.isConnected)return;button('我的回報',p,()=>myReports());button('我的進度通知',p,()=>notifications('user'));if(profile.admin)button('管理員新回報通知',p,()=>notifications('admin'));
 const data=await request('/notifications?audience='+audience+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!p.isConnected)return;message.textContent=data.rows.length?'本頁 '+data.rows.length+' 筆通知':'目前沒有通知';
 for(const row of data.rows){const card=el('section',undefined,p,'community-card');el('h3',(row.read?'':'● 未讀 · ')+row.title,card);el('small',new Date(row.created_at).toLocaleString('zh-TW'),card);el('p','回報編號：'+row.report_id,card);if(row.status)el('p',statusLabels[row.status],card);if(row.public_reply)el('p',row.public_reply,card);button(audience==='admin'?'查看管理後台':'查看我的回報',card,()=>audience==='admin'?admin():myReports());if(!row.read)button('標示已讀',card,async()=>{await request('/notifications/'+row.id+'/read?audience='+audience,{method:'POST'});await notifications(audience,cursor);refreshBadge();});}
 if(data.next)button('下一頁',p,()=>notifications(audience,data.next));
 }catch(e){message.textContent=e.message;button('帳號登入',p,account);}
}
let badgeTimer,badgeBusy=false;
function badge(text,title){const b=document.getElementById('notificationBell');if(b){b.textContent='🔔'+(text?' '+text:'');b.title=title;b.setAttribute('aria-label',title);}}
async function refreshBadge(){
 clearTimeout(badgeTimer);if(document.hidden||badgeBusy)return;
 if(!auth?.currentUser){badge('','站內通知（登入後查看）');return;}
 const uid=auth.currentUser.uid,generation=accountGeneration;
 badgeBusy=true;try{const mine=await request('/notifications');const feeds=[mine];if(profile?.admin)feeds.push(await request('/notifications?audience=admin'));if(generation!==accountGeneration)return;const n=feeds.reduce((sum,d)=>sum+d.rows.filter(r=>!r.read).length,0);badge(n?String(n)+(feeds.some(d=>d.next)?'+':''):'','站內通知：最近通知中 '+n+' 筆未讀');}catch{if(generation===accountGeneration)badge('!','通知暫時無法更新，點擊重試');}finally{badgeBusy=false;if(auth?.currentUser&&!document.hidden)badgeTimer=setTimeout(refreshBadge,auth.currentUser.uid===uid?60000:0);else badge('','站內通知（登入後查看）');}
}
window.addEventListener('chiayi-account-change',()=>{badge('','站內通知');refreshBadge();});
document.addEventListener('visibilitychange',()=>{clearTimeout(badgeTimer);if(!document.hidden)refreshBadge();});
window.ChiayiCommunity={mount(panelFn,closeFn){hostPanel=panelFn;closePanel=closeFn;receiveShare();window.addEventListener('hashchange',receiveShare);initialize().then(refreshBadge).catch(()=>{});},open(type){return ({favorite:library,history:()=>library('history'),notifications,myReports,share,account,backup,report,admin}[type]||account)();}};
})();
