(function(root){
  'use strict';
  function point(p){
    if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||p.lat<23.35||p.lat>23.60||p.lng<120.30||p.lng>120.60)throw Error('位置不在嘉義服務範圍內');
    return {lat:p.lat,lng:p.lng};
  }
  function clean(r){
    if(!r||!['walk','bike'].includes(r.mode))throw Error('交通方式不正確');
    const extra=r.extra_minutes??null;
    if(extra!==null&&(![3,5,10].includes(extra)||r.mode!=='walk'))throw Error('步行時間設定不正確');
    return {mode:r.mode,start:point(r.start),end:point(r.end),extra_minutes:extra};
  }
  function encode(r){const v=clean(r);return encodeURIComponent(JSON.stringify({v:1,...v}));}
  function decode(s){
    if(s.length>1400)throw Error('分享連結過長');
    let v;try{v=JSON.parse(decodeURIComponent(s));}catch{throw Error('分享連結無法讀取');}
    if(v.v!==1)throw Error('不支援的分享版本');
    return clean(v);
  }
  function favorite(r){
    if(typeof r.id!=='string'||!/^[-\w]{1,64}$/.test(r.id)||typeof r.title!=='string'||!r.title.trim()||r.title.length>80)throw Error('收藏資料格式不正確');
    return {id:r.id,title:r.title.trim(),...clean(r)};
  }
  const api={point,clean,encode,decode,favorite};
  if(typeof module!=='undefined')module.exports=api;
  else root.ChiayiRecords=api;
})(typeof window!=='undefined'?window:globalThis);
