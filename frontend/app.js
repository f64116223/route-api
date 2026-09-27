/* ===== 原 index.html inline script 1 ===== */

// ============================================================
// 歡迎畫面保險入口：即使後方地圖/圖層腳本發生錯誤，仍可進入主畫面
// ============================================================
function enterMainSite() {
  var overlay = document.getElementById('welcomeOverlay');
  if (overlay) {
    overlay.classList.add('hide');
    overlay.style.pointerEvents = 'none';
    window.setTimeout(function () {
      overlay.style.display = 'none';
    }, 420);
  }

  // Leaflet 已完成初始化時才重新計算尺寸；尚未完成則直接略過。
  window.setTimeout(function () {
    try {
      if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
        map.invalidateSize();
      }
    } catch (e) {
      console.warn('進入主畫面後重新計算地圖尺寸失敗：', e);
    }
  }, 450);
}


/* ===== 原 index.html inline script 8 ===== */


// ============================================================
// TWD97 / TM2 zone 121
// EPSG:3826
// ============================================================

proj4.defs(
  "EPSG:3826",
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs"
);



// ---------------- 地圖與圖層（保留你原始所有圖層） ----------------

let currentShortDist = 0;
let currentNdviDist = 0;
let currentGviDist = 0;

let treeRasterLayer = null;

// ---------------- 底圖 ----------------

// OpenStreetMap
let osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }
);

// 臺灣通用電子地圖
// NLSC WMTS / EMAP
let taiwanMap = L.tileLayer(
  'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
  {
    maxZoom: 19,
    attribution: '© 內政部國土測繪中心'
  }
);

// Google 衛星影像
let googleSat = L.tileLayer(
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
  {
    maxZoom: 20,
    attribution: '© Google'
  }
);

// Stadia 淺色
let stadiaLight=L.tileLayer(
  'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
  {
    maxZoom:20,
    attribution:'&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap'
  }
);

// Stadia 深色
let stadiaDark=L.tileLayer(
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
  {
    maxZoom:20,
    attribution:'&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap'
  }
);

let map = L.map('map',{
  center:[23.4801, 120.4491],
  zoom:13,
  layers:[stadiaDark]
});


const streetViewModal =  document.getElementById(    'streetViewModal'  );
const closeStreetViewModal =  document.getElementById(    'closeStreetViewModal'  );
const streetViewPegman =  document.getElementById(    'streetViewPegman'  );

const streetViewHint =
  document.getElementById('streetViewHint');


let streetViewHintTimer = null;


// ============================================================
// 顯示 Street View 功能提示
// ============================================================

function showStreetViewHint() {

  // 如果之前的計時器還存在，先清掉
  if (streetViewHintTimer) {

    clearTimeout(
      streetViewHintTimer
    );

  }


  // 顯示提示
  streetViewHint.classList.add(
    'show'
  );


  // 5 秒後自動消失
  streetViewHintTimer =
    setTimeout(
      function() {

        streetViewHint.classList.remove(
          'show'
        );

      },
      5000
    );

}

// ============================================================
// Street View Pegman：拖曳到地圖查看街景
// ============================================================

let pegmanDragging = false;

let pegmanGhost = null;


// ------------------------------------------------------------
// 開始拖曳
// ------------------------------------------------------------

streetViewPegman.addEventListener(
  'pointerdown',
  function(e) {

    e.preventDefault();
    e.stopPropagation();


    // 開始使用 Street View 後立即關閉提示
    streetViewHint.classList.remove(
      'show'
    );

    if (streetViewHintTimer) {

      clearTimeout(
        streetViewHintTimer
      );

      streetViewHintTimer = null;

    }

    pegmanDragging = true;

    streetViewPegman.classList.add('dragging');

    // 建立跟著滑鼠移動的小黃人
    pegmanGhost =
      streetViewPegman.cloneNode(true);

    pegmanGhost.removeAttribute('id');

    pegmanGhost.style.position = 'fixed';
    pegmanGhost.style.left = `${e.clientX - 19}px`;
    pegmanGhost.style.top = `${e.clientY - 24}px`;

    pegmanGhost.style.right = 'auto';
    pegmanGhost.style.bottom = 'auto';

    pegmanGhost.style.zIndex = '99999';

    pegmanGhost.style.pointerEvents = 'none';

    document.body.appendChild(
      pegmanGhost
    );

    streetViewPegman.setPointerCapture(
      e.pointerId
    );

  }
);


// ------------------------------------------------------------
// 拖曳中
// ------------------------------------------------------------

streetViewPegman.addEventListener(
  'pointermove',
  function(e) {

    if (!pegmanDragging || !pegmanGhost) {
      return;
    }

    pegmanGhost.style.left =
      `${e.clientX - 19}px`;

    pegmanGhost.style.top =
      `${e.clientY - 24}px`;

  }
);


// ------------------------------------------------------------
// 放開小黃人
// ------------------------------------------------------------

streetViewPegman.addEventListener(
  'pointerup',
  function(e) {

    if (!pegmanDragging) {
      return;
    }

    pegmanDragging = false;

    streetViewPegman.classList.remove(
      'dragging'
    );


    // 移除拖曳中的複製小黃人
    if (pegmanGhost) {

      pegmanGhost.remove();

      pegmanGhost = null;

    }


    // ----------------------------------------------------------
    // 判斷是否放在 Leaflet 地圖範圍內
    // ----------------------------------------------------------

    const mapContainer =
      map.getContainer();

    const rect =
      mapContainer.getBoundingClientRect();


    const insideMap =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;


    if (!insideMap) {
      return;
    }


    // ----------------------------------------------------------
    // 螢幕座標 → Leaflet 地圖座標
    // ----------------------------------------------------------

    const containerPoint =
      L.point(
        e.clientX - rect.left,
        e.clientY - rect.top
      );


    const latlng =
      map.containerPointToLatLng(
        containerPoint
      );


    // ----------------------------------------------------------
    // 開啟 Street View
    // ----------------------------------------------------------

    openStreetViewModal();

    streetViewMarkerEnabled = true;

    showStreetView(
      latlng.lat,
      latlng.lng,
      true
    );

  }
);


// ------------------------------------------------------------
// 拖曳被瀏覽器取消
// ------------------------------------------------------------

streetViewPegman.addEventListener(
  'pointercancel',
  function() {

    pegmanDragging = false;

    streetViewPegman.classList.remove(
      'dragging'
    );

    if (pegmanGhost) {

      pegmanGhost.remove();

      pegmanGhost = null;

    }

  }
);

function openStreetViewModal() {  streetViewModal.classList.add('show');}
function hideStreetViewModal() {  streetViewModal.classList.remove('show');}

closeStreetViewModal.addEventListener(  'click',  hideStreetViewModal);

// ============================================================
// 地圖全螢幕功能
// ============================================================

const mapWrap = document.querySelector('.map-wrap');

const fullscreenControl = L.control({
  position: 'topright'
});

fullscreenControl.onAdd = function () {

  const button = L.DomUtil.create(
    'button',
    'leaflet-control-fullscreen'
  );

  button.innerHTML = '⛶';
  button.title = '全螢幕';
  button.type = 'button';

  // ==========================================================
  // 防止按鈕點擊事件傳到 Leaflet 地圖
  // 避免誤觸「設定起點」
  // ==========================================================

  L.DomEvent.disableClickPropagation(button);
  L.DomEvent.disableScrollPropagation(button);

  // ==========================================================
  // 全螢幕按鈕事件
  // ==========================================================

  button.addEventListener('click', function (e) {

    // 阻止事件繼續傳遞
    e.preventDefault();
    e.stopPropagation();

    if (!document.fullscreenElement) {

      // 進入地圖區域全螢幕
      mapWrap.requestFullscreen();

    } else {

      // 退出全螢幕
      document.exitFullscreen();

    }

  });

  return button;
};

fullscreenControl.addTo(map);


// ============================================================
// 全螢幕切換後，重新計算 Leaflet 地圖尺寸
// ============================================================

document.addEventListener('fullscreenchange', function () {

  setTimeout(function () {
    map.invalidateSize();
  }, 100);

});


// ✅ 放在這裡（map 初始化之後）
window.addEventListener("resize", () => {  setTimeout(() => {    map.invalidateSize();

    // 地圖尺寸改變後，重新繪製 NDVI raster 圖層
    if (ndviLayer && map.hasLayer(ndviLayer)) {      ndviLayer.redraw();    }  }, 200);
});


// ============================================================
// 福衛八號衛星影像圖層
// ============================================================

const formosat8 = L.tileLayer(
  "https://healthy-route-api-995293427533.asia-east1.run.app/formosat8/{z}/{x}/{y}.png",
  {
    minZoom: 11,
    maxNativeZoom: 18,
    maxZoom: 20,

    // 疊圖層建議先稍微透明
    opacity: 0.8,
    zIndex: 200,
    attribution: "福衛八號衛星影像"
  }
);

  formosat8.addTo(map);

// ============================================================
// 底圖
// ============================================================

let baseMaps={
  "臺灣通用電子地圖":taiwanMap,
  "OpenStreetMap":osm,
  "Google 衛星":googleSat,
  "Stadia 淺色":stadiaLight,
  "Stadia 深色":stadiaDark
};


// ============================================================
// 疊圖層
// ============================================================

let overlayMaps = {
  "福衛八號影像": formosat8
};


// ============================================================
// 圖層控制
// ============================================================

let layerControl = L.control.layers(
  baseMaps,
  overlayMaps,
  {
    position: "topright"
  }
).addTo(map);

// ============================================================
// 樹木分類 TIF 圖層
// ============================================================

const TREE_TIF_URL =
  "https://storage.googleapis.com/chiayi_ndvi/trees.tif";

console.log("開始載入樹木分類 GeoTIFF...");
console.log("TREE TIF URL:", TREE_TIF_URL);


fetch(TREE_TIF_URL)

  .then(function(response) {

    console.log(
      "樹木分類 GeoTIFF HTTP 狀態:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        "樹木分類 GeoTIFF 下載失敗，HTTP " +
        response.status
      );
    }

    return response.arrayBuffer();

  })


  .then(function(arrayBuffer) {

    console.log(
      "樹木分類 GeoTIFF 下載完成，大小:",
      arrayBuffer.byteLength,
      "bytes"
    );

    return parseGeoraster(arrayBuffer);

  })


  .then(function(georaster) {

    console.log(
      "樹木分類 GeoRaster 解析成功:",
      georaster
    );

    console.log(
      "樹木 Raster projection:",
      georaster.projection
    );

    console.log(
      "樹木 Raster NoData:",
      georaster.noDataValue
    );

    console.log(
      "樹木 Raster min:",
      georaster.mins
    );

    console.log(
      "樹木 Raster max:",
      georaster.maxs
    );

    console.log(
      "樹木 Raster 範圍:",
      {
        xmin: georaster.xmin,
        xmax: georaster.xmax,
        ymin: georaster.ymin,
        ymax: georaster.ymax
      }
    );


    // ========================================================
    // 建立 Raster 圖層
    // ========================================================

    treeRasterLayer = new GeoRasterLayer({

      georaster: georaster,

      opacity: 0.75,

      resolution: 256,

      zIndex: 350,

      // 分類資料一定使用 nearest
      // 避免把 3 插值成 2.7、2.5...
      resampleMethod: "nearest",

      pixelValuesToColorFn: function(values) {

        const value = values[0];


        // 無效值
        if (
          value === null ||
          value === undefined ||
          !Number.isFinite(value)
        ) {
          return null;
        }


        // NoData
        if (
          georaster.noDataValue !== null &&
          georaster.noDataValue !== undefined &&
          value === georaster.noDataValue
        ) {
          return null;
        }


        // ====================================================
        // ArcGIS Pro：
        // Minimum = 3
        // Maximum = 3
        //
        // 所以 Value 3 就是樹木
        // ====================================================

        if (value === 3) {

          return "#0f6b32";

        }


        // 其他全部透明
        return null;

      }

    });


    console.log(
      "樹木分類 GeoRasterLayer 建立完成:",
      treeRasterLayer
    );


    // ========================================================
    // 加入 Leaflet 圖層控制
    // ========================================================

    layerControl.addOverlay(
      treeRasterLayer,
      "樹木分類"
    );


    console.log(
      "樹木分類已加入圖層控制"
    );

  })


  .catch(function(error) {

    console.error(
      "================================"
    );

    console.error(
      "樹木分類 GeoTIFF 載入失敗"
    );

    console.error(error);

    console.error(
      "================================"
    );

  });

// ============================================================
// 嘉義市區界 + GVI 路網 GeoJSON
// ============================================================

const CHIAYI_BOUNDARY_URL =
  "https://storage.googleapis.com/chiayi_ndvi/%E5%98%89%E7%BE%A9%E5%B8%82%E5%8D%80%E7%95%8C.geojson";

const CHIAYI_RENDVI_ROAD_URL =
  "https://storage.googleapis.com/chiayi_ndvi/%E5%98%89%E7%BE%A9%E5%B8%82reNDVI%E8%B7%AF%E7%B6%B2.geojson";

const CHIAYI_GVI_ROAD_URL =
  "https://storage.googleapis.com/chiayi_ndvi/%E5%98%89%E7%BE%A9%E5%B8%82GVI%E8%B7%AF%E7%B6%B2.geojson";


// ------------------------------------------------------------
// 1. 嘉義市區界
// ------------------------------------------------------------

let chiayiBoundaryLayer = null;

fetch(CHIAYI_BOUNDARY_URL)
  .then(response => {

    if (!response.ok) {
      throw new Error(
        "嘉義市區界 GeoJSON 載入失敗，HTTP " + response.status
      );
    }

    return response.json();
  })

  .then(data => {

    console.log("嘉義市區界 GeoJSON 載入成功", data);

    chiayiBoundaryLayer = L.geoJSON(data, {

      style: function(feature) {

        return {
          color: "#f2f2f2",
          weight: 2.5,
          opacity: 0.65,

          fill: false
        };

      },

      onEachFeature: function(feature, layer) {

        if (!feature.properties) return;

        const townName =
          feature.properties.TOWNNAME || "";

        if (townName) {
          layer.bindTooltip(
            townName,
            {
              sticky: true,
              direction: "top"
            }
          );
        }

      }

    });

    // 加入圖層控制
    overlayMaps["嘉義市區界"] = chiayiBoundaryLayer;

    layerControl.addOverlay(
      chiayiBoundaryLayer,
      "嘉義市區界"
    );

    // 預設顯示嘉義市區界
    chiayiBoundaryLayer.addTo(map);

    console.log("嘉義市區界已加入圖層控制");

  })

  .catch(error => {
    console.error(
      "嘉義市區界載入錯誤：",
      error
    );
  });


// ------------------------------------------------------------
// ============================================================
// 主題道路線寬：依縮放層級自動調整
// 小比例尺時降低線寬，避免道路過密造成整片糊在一起；放大後再逐步加粗。
// ============================================================
function getThematicRoadWeight() {
  const z = map ? map.getZoom() : 13;
  if (z <= 11) return 0.85;
  if (z === 12) return 1.05;
  if (z === 13) return 1.35;
  if (z === 14) return 1.75;
  if (z === 15) return 2.15;
  return 2.55;
}

function refreshThematicRoadWeights() {
  if (rendviRoadLayer) rendviRoadLayer.setStyle({ weight: getThematicRoadWeight() });
  if (gviRoadLayer) gviRoadLayer.setStyle({ weight: getThematicRoadWeight() });
}

map.on('zoomend', refreshThematicRoadWeights);

// 2. 載入 reNDVI 路網（GeoJSON，數值欄位：MAX）
// ------------------------------------------------------------
let currentRendviRoadOpacity = 0.90;
let rendviRoadLayer = null;
let currentRendviMin = 0;
let currentRendviMax = 1;
let currentRendviP05 = 0;
let currentRendviP95 = 1;

fetch(CHIAYI_RENDVI_ROAD_URL)
  .then(response => {
    if (!response.ok) {
      throw new Error(
        "reNDVI 路網 GeoJSON 載入失敗，HTTP " + response.status
      );
    }
    return response.json();
  })
  .then(data => {
    const values = data.features
      .map(feature => Number(feature.properties?.MAX))
      .filter(value => Number.isFinite(value));

    if (values.length > 0) {
      currentRendviMin = Math.min(...values);
      currentRendviMax = Math.max(...values);

      // 視覺化採 P5–P95 stretch：
      // 不改動原始 reNDVI 數值，只把大多數道路的色彩差異拉開。
      const sortedValues = [...values].sort((a, b) => a - b);
      const percentile = (arr, p) => {
        if (!arr.length) return null;
        const index = (arr.length - 1) * p;
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return arr[lower];
        return arr[lower] + (arr[upper] - arr[lower]) * (index - lower);
      };
      currentRendviP05 = percentile(sortedValues, 0.05);
      currentRendviP95 = percentile(sortedValues, 0.95);
    }

    // 避免所有值都一樣時 chroma domain 失效
    if (!Number.isFinite(currentRendviP05)) currentRendviP05 = currentRendviMin;
    if (!Number.isFinite(currentRendviP95)) currentRendviP95 = currentRendviMax;
    if (currentRendviP95 <= currentRendviP05) {
      currentRendviP95 = currentRendviP05 + 1e-6;
    }

    console.log(
      "reNDVI MAX 實際範圍：", currentRendviMin, "~", currentRendviMax,
      "；視覺化 P5–P95：", currentRendviP05, "~", currentRendviP95
    );

    // reNDVI：藍 → 青 → 綠。
    // reNDVI 色階方向：低值淡黃綠，高值深藍。
    const rendviRoadScale = chroma
      .scale([
        "#F6F4A9",
        "#B8E186",
        "#66C2A4",
        "#2A9D8F",
        "#2C7FB8",
        "#253494"
      ])
      .domain([currentRendviP05, currentRendviP95])
      .mode("lab");

    function getRendviRoadColor(value) {
      const v = Number(value);
      return Number.isFinite(v)
        ? rendviRoadScale(Math.max(currentRendviP05, Math.min(currentRendviP95, v))).hex()
        : "#bdbdbd";
    }

    rendviRoadLayer = L.geoJSON(data, {
      style: function(feature) {
        const value = feature.properties?.MAX;
        return {
          color: getRendviRoadColor(value),
          weight: getThematicRoadWeight(),
          opacity: currentRendviRoadOpacity,
          lineCap: "round",
          lineJoin: "round"
        };
      },

      onEachFeature: function(feature, layer) {
        if (!feature.properties) return;

        const value = Number(feature.properties.MAX);
        const roadName = feature.properties.ROADNAME || "未命名道路";
        const valueText = Number.isFinite(value)
          ? value.toFixed(3)
          : "無資料";

        layer.bindTooltip(
          `<div style="font-size:12px;line-height:1.5;">
            <b>${roadName}</b><br>
            reNDVI：${valueText}
          </div>`,
          { sticky: true, direction: "top" }
        );

        layer.on({
          mouseover: function(e) {
            e.target.setStyle({ weight: getThematicRoadWeight() + 2, opacity: 1 });
          },
          mouseout: function(e) {
            rendviRoadLayer.resetStyle(e.target);
          }
        });
      }
    });

    overlayMaps["道路綠暴露（reNDVI）"] = rendviRoadLayer;
    layerControl.addOverlay(rendviRoadLayer, "道路綠暴露（reNDVI）");

    console.log("道路綠暴露（reNDVI）已加入圖層控制");
  })
  .catch(error => {
    console.error("reNDVI路網載入錯誤：", error);
  });

// ============================================================
// reNDVI 路網圖例
// ============================================================
const rendviRoadLegend = L.control({ position: "bottomleft" });

rendviRoadLegend.onAdd = function() {
  const div = L.DomUtil.create("div", "rendvi-road-legend");
  const mid = (currentRendviP05 + currentRendviP95) / 2;

  div.innerHTML = `
    <div class="rendvi-road-legend-title">🌿 reNDVI 路網 <span style="font-size:9px;font-weight:600;color:#64748b;">(P5–P95)</span></div>
    <div class="rendvi-road-gradient"></div>
    <div class="rendvi-road-legend-labels">
      <span>${currentRendviP05.toFixed(2)}</span>
      <span>${mid.toFixed(2)}</span>
      <span>${currentRendviP95.toFixed(2)}</span>
    </div>
  `;

  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
};

map.on("overlayadd", function(e) {
  if (rendviRoadLayer && e.layer === rendviRoadLayer) {
    rendviRoadLegend.addTo(map);
  }
});

map.on("overlayremove", function(e) {
  if (rendviRoadLayer && e.layer === rendviRoadLayer) {
    rendviRoadLegend.remove();
  }
});

// ------------------------------------------------------------
// 3. 載入 GVI 路網
// ------------------------------------------------------------
let currentGviRoadOpacity = 0.90;
let gviRoadLayer = null;
let currentGviMin = 0;
let currentGviMax = 100;
let currentGviP05 = 0;
let currentGviP95 = 100;


fetch(CHIAYI_GVI_ROAD_URL)

  .then(response => {

    if (!response.ok) {
      throw new Error(
        "GVI 路網 GeoJSON 載入失敗，HTTP " +
        response.status
      );
    }

    return response.json();
  })

  .then(data => {

  // ------------------------------------------------------------
  // 依目前 GVI 資料自動計算最小值 / 最大值
  // ------------------------------------------------------------

  const gviValues = data.features
    .map(feature => Number(feature.properties?.MEAN_NEAR))
    .filter(value => Number.isFinite(value));

  const gviMin = Math.min(...gviValues);
  const gviMax = Math.max(...gviValues);
  currentGviMin = gviMin;
  currentGviMax = gviMax;

  if (gviValues.length > 0) {
    const sortedGvi = [...gviValues].sort((a, b) => a - b);
    const percentile = (arr, p) => {
      const index = (arr.length - 1) * p;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      if (lower === upper) return arr[lower];
      return arr[lower] + (arr[upper] - arr[lower]) * (index - lower);
    };
    currentGviP05 = percentile(sortedGvi, 0.05);
    currentGviP95 = percentile(sortedGvi, 0.95);
  }

  if (!Number.isFinite(currentGviP05)) currentGviP05 = gviMin;
  if (!Number.isFinite(currentGviP95)) currentGviP95 = gviMax;
  if (currentGviP95 <= currentGviP05) {
    currentGviP95 = currentGviP05 + 1e-6;
  }

  console.log(
    "GVI MEAN_NEAR 實際範圍：", gviMin, "~", gviMax,
    "；視覺化 P5–P95：", currentGviP05, "~", currentGviP95
  );


  // ------------------------------------------------------------
  // GVI：柔和黃 → 黃綠 → 自然綠 → 深青綠
  // 保留「綠視率」的綠色直覺，但以低飽和黃綠起始，避免整張地圖過度單一綠。
  // ------------------------------------------------------------

  const gviRoadScale = chroma
    .scale([
      "#F4E66A",
      "#D7E96B",
      "#A7D96B",
      "#69C66B",
      "#2FA66B",
      "#147A63"
    ])
    .domain([currentGviP05, currentGviP95])
    .mode("lab");    

    function getGviRoadColor(value) {

      const gvi = Number(value);

      if (!Number.isFinite(gvi)) {
        return "#bdbdbd";
      }

      return gviRoadScale(Math.max(currentGviP05, Math.min(currentGviP95, gvi))).hex();
    }

    console.log(
      "嘉義市 GVI 路網 GeoJSON 載入成功",
      data
    );

    gviRoadLayer = L.geoJSON(data, {

      style: function(feature) {

        const gvi =
          feature.properties
            ? feature.properties.MEAN_NEAR
            : null;

        return {

          color: getGviRoadColor(gvi),

          weight: getThematicRoadWeight(),

          opacity: currentGviRoadOpacity,

          lineCap: "round",

          lineJoin: "round"

        };

      },


      // --------------------------------------------------------
      // 滑鼠移到道路上顯示 GVI
      // --------------------------------------------------------

      onEachFeature: function(feature, layer) {

        if (!feature.properties) return;

        const gvi =
          Number(feature.properties.MEAN_NEAR);

        const roadName =
          feature.properties.ROADNAME || "未命名道路";

        const gviText =
          Number.isFinite(gvi)
            ? gvi.toFixed(2)
            : "無資料";


        layer.bindTooltip(

          `
          <div style="
            font-size:12px;
            line-height:1.5;
          ">
            <b>${roadName}</b><br>
            GVI：${gviText} %
          </div>
          `,

          {
            sticky: true,
            direction: "top"
          }

        );


        // ------------------------------------------------------
        // 滑鼠移入時稍微加粗
        // ------------------------------------------------------

        layer.on({

          mouseover: function(e) {

            e.target.setStyle({
              weight: getThematicRoadWeight() + 2,
              opacity: 1
            });

          },


          mouseout: function(e) {

            gviRoadLayer.resetStyle(
              e.target
            );

          }

        });

      }

    });


    // 加入圖層控制
    overlayMaps["道路綠視率（GVI）"] =
      gviRoadLayer;

    layerControl.addOverlay(
      gviRoadLayer,
      "道路綠視率（GVI）"
    );


    // ----------------------------------------------------------
    // 如果想讓 GVI 一進網頁就出現，把下面這行打開
    // ----------------------------------------------------------

    // gviRoadLayer.addTo(map);


    console.log(
      "道路綠視率（GVI）已加入圖層控制"
    );

  })

  .catch(error => {

    console.error(
      "GVI 路網載入錯誤：",
      error
    );

  });

// ============================================================
// GVI 路網圖例
// ============================================================

const gviLegend =
  L.control({
    position: "bottomleft"
  });

gviLegend.onAdd =
  function(map) {

    const div =
      L.DomUtil.create(
        "div",
        "gvi-road-legend"
      );


    div.innerHTML = `

      <div class="gvi-road-legend-title">
        🌳 GVI 綠視率 <span style="font-size:9px;font-weight:600;color:#64748b;">(P5–P95)</span>
      </div>

      <div class="gvi-road-gradient">
      </div>

      <div class="gvi-road-legend-labels">

        <span>
          ${currentGviP05.toFixed(1)}%
        </span>

        <span>
          ${(
            (currentGviP05 + currentGviP95) / 2
          ).toFixed(1)}%
        </span>

        <span>
          ${currentGviP95.toFixed(1)}%
        </span>

      </div>
    `;


    L.DomEvent
      .disableClickPropagation(div);

    L.DomEvent
      .disableScrollPropagation(div);


    return div;

  };


// ============================================================
// GVI 圖層開關 → 同步顯示 / 隱藏圖例
// ============================================================

map.on(
  "overlayadd",
  function(e) {

    if (
      gviRoadLayer &&
      e.layer === gviRoadLayer
    ) {

      gviLegend.addTo(map);

    }

  }
);


map.on(
  "overlayremove",
  function(e) {

    if (
      gviRoadLayer &&
      e.layer === gviRoadLayer
    ) {

      gviLegend.remove();

    }

  }
);
  
// 🟢 新增：優化手機版圖層選單的關閉機制
const layerControlContainer = layerControl.getContainer();
layerControlContainer.addEventListener('pointerenter', e=>{if(e.pointerType==='mouse')layerControl.expand();});
layerControlContainer.querySelector('.leaflet-control-layers-toggle').addEventListener('click', e=>{e.preventDefault();layerControl.expand();});

// 1. 建立一個「關閉選單」的按鈕
const closeLayerBtn = document.createElement('button');
closeLayerBtn.className = 'leaflet-control-layers-close-btn';
closeLayerBtn.innerHTML = '關閉 ✖';

// 2. 將按鈕塞進 Leaflet 的圖層控制容器中
layerControlContainer.appendChild(closeLayerBtn);

// 3. 綁定事件：當手指點擊這個關閉按鈕時，強迫收合選單
closeLayerBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // 防止點擊事件穿透到地圖上觸發點擊設定起點
  layerControl.collapse(); // 呼叫 Leaflet 原生內建的收合方法
});

// ============================================================
// 圖層不透明度控制：直接併入各「綠色健康圖層」項目下方
// ============================================================

function createInlineOpacityControl(id, value) {
  const row = document.createElement('div');
  row.className = 'inline-layer-opacity';
  row.dataset.opacityFor = id;
  row.innerHTML = `
    <span class="inline-opacity-label">不透明度</span>
    <input
      type="range"
      id="${id}"
      min="0"
      max="100"
      value="${value}"
      step="5"
      aria-label="圖層不透明度"
    >
    <span class="inline-opacity-value" id="${id}Value">${value}%</span>
  `;

  L.DomEvent.disableClickPropagation(row);
  L.DomEvent.disableScrollPropagation(row);
  return row;
}

// 先建立所有滑桿，即使某些非同步圖層稍後才加入，事件也能先綁定。
const inlineOpacityControls = {
  '福衛八號影像': createInlineOpacityControl('formosatOpacity', 80),
  '樹木分類': createInlineOpacityControl('treeOpacity', 75),
  '綠暴露（reNDVI）': createInlineOpacityControl('rendviRasterOpacity', 60),
  '道路綠暴露（reNDVI）': createInlineOpacityControl('rendviRoadOpacity', 90),
  '道路綠視率（GVI）': createInlineOpacityControl('gviOpacity', 90)
};

// ============================================================
// 圖層控制分組標題 + 綠色健康圖層固定排序
// ============================================================
let layerControlOrganizing = false;

function organizeLayerControl() {
  if (layerControlOrganizing) return;
  layerControlOrganizing = true;

  const baseSection = layerControlContainer.querySelector('.leaflet-control-layers-base');
  const overlaySection = layerControlContainer.querySelector('.leaflet-control-layers-overlays');

  if (baseSection && !baseSection.querySelector('.layer-section-title')) {
    const title = document.createElement('div');
    title.className = 'layer-section-title';
    title.textContent = '介接底圖';
    baseSection.insertBefore(title, baseSection.firstChild);
  }

  if (overlaySection) {
    if (!overlaySection.querySelector('.layer-section-title')) {
      const title = document.createElement('div');
      title.className = 'layer-section-title';
      title.textContent = '綠色健康圖層';
      overlaySection.insertBefore(title, overlaySection.firstChild);
    }

    const desiredOrder = [
      '嘉義市區界',
      '福衛八號影像',
      '樹木分類',
      '道路綠視率（GVI）',
      '道路綠暴露（reNDVI）',
      '綠暴露（reNDVI）',
      '即時車流（VD）',
      '自行車道（參考）'
    ];

    const labels = Array.from(overlaySection.querySelectorAll('label'));
    const currentNames = labels.map(item => item.textContent.trim());
    const orderedExistingNames = desiredOrder.filter(name => currentNames.includes(name));

    const isAlreadyOrdered = orderedExistingNames.every((name, index) => {
      return currentNames[index] === name;
    });

    if (!isAlreadyOrdered) {
      desiredOrder.forEach(name => {
        const label = labels.find(item => item.textContent.trim() === name);
        if (label) {
          overlaySection.appendChild(label);
          const slider = inlineOpacityControls[name];
          if (slider) overlaySection.appendChild(slider);
        }
      });
    }

    // 不論目前排序是否已正確，都確認不透明度滑桿緊接在對應圖層開關下一行。
    desiredOrder.forEach(name => {
      const currentLabels = Array.from(overlaySection.querySelectorAll('label'));
      const label = currentLabels.find(item => item.textContent.trim() === name);
      const slider = inlineOpacityControls[name];
      if (label && slider && label.nextElementSibling !== slider) {
        label.insertAdjacentElement('afterend', slider);
      }
    });
  }

  layerControlOrganizing = false;
}

organizeLayerControl();
const originalAddOverlay = layerControl.addOverlay;
layerControl.addOverlay = function(layer, name) {
  const result = originalAddOverlay.call(this, layer, name);
  organizeLayerControl();
  return result;
};

const layerControlObserver = new MutationObserver(function() {
  organizeLayerControl();
});

const layerControlObserverTarget =
  layerControlContainer.querySelector('.leaflet-control-layers-list') ||
  layerControlContainer;

// 單檔版不持續監聽圖層控制 DOM。
//
// 原本 MutationObserver 會在圖層清單變動時反覆執行 organizeLayerControl()；
// 單檔版又會在頁面初始化後加入「嘉義市自行車道」，因此瀏覽器可能因為
// DOM 移動 -> observer -> 再整理 DOM 的循環而長時間佔用主執行緒。
// 前面已經執行過 organizeLayerControl()，這裡不需要再持續 observe。
//
// layerControlObserver.observe(layerControlObserverTarget, {
//   childList: true,
//   subtree: true
// });




// ============================================================
// 福衛八號不透明度
// ============================================================

const formosatOpacity =
  inlineOpacityControls['福衛八號影像'].querySelector('#formosatOpacity');

const formosatOpacityValue =
  inlineOpacityControls['福衛八號影像'].querySelector('#formosatOpacityValue');


formosatOpacity.addEventListener('input', function () {

  const value = Number(this.value);

  formosat8.setOpacity(
    value / 100
  );

  formosatOpacityValue.innerText =
    `${value}%`;

});


// ============================================================
// 綠暴露（reNDVI）Raster 不透明度
// ============================================================

const rendviRasterOpacity =
  inlineOpacityControls['綠暴露（reNDVI）'].querySelector('#rendviRasterOpacity');

const rendviRasterOpacityValue =
  inlineOpacityControls['綠暴露（reNDVI）'].querySelector('#rendviRasterOpacityValue');

rendviRasterOpacity.addEventListener('input', function () {
  const value = Number(this.value);

  if (ndviLayer) {
    ndviLayer.setOpacity(value / 100);
  }

  rendviRasterOpacityValue.innerText = `${value}%`;
});


// ============================================================
// 道路綠暴露（reNDVI）不透明度
// ============================================================

const rendviRoadOpacity =
  inlineOpacityControls['道路綠暴露（reNDVI）'].querySelector('#rendviRoadOpacity');

const rendviRoadOpacityValue =
  inlineOpacityControls['道路綠暴露（reNDVI）'].querySelector('#rendviRoadOpacityValue');


rendviRoadOpacity.addEventListener('input', function () {

  const value = Number(this.value);
  currentRendviRoadOpacity = value / 100;

  if (rendviRoadLayer) {
    rendviRoadLayer.eachLayer(function(layer) {
      if (layer.setStyle) {
        layer.setStyle({ opacity: currentRendviRoadOpacity });
      }
    });
  }

  rendviRoadOpacityValue.innerText = `${value}%`;

});

// ============================================================
// GVI 路網不透明度
// ============================================================

const gviOpacity =
  inlineOpacityControls['道路綠視率（GVI）'].querySelector('#gviOpacity');

const gviOpacityValue =
  inlineOpacityControls['道路綠視率（GVI）'].querySelector('#gviOpacityValue');


gviOpacity.addEventListener(
  'input',
  function () {

    const value =
      Number(this.value);

    currentGviRoadOpacity =
      value / 100;

    if (gviRoadLayer) {

      gviRoadLayer.eachLayer(
        function(layer) {

          if (layer.setStyle) {

            layer.setStyle({
              opacity: currentGviRoadOpacity
            });

          }

        }
      );

    }

    gviOpacityValue.innerText =
      `${value}%`;

  }
);


// ============================================================
// 樹木分類不透明度
// ============================================================

const treeOpacity =
  inlineOpacityControls['樹木分類'].querySelector('#treeOpacity');

const treeOpacityValue =
  inlineOpacityControls['樹木分類'].querySelector('#treeOpacityValue');


treeOpacity.addEventListener(
  'input',
  function () {

    const value =
      Number(this.value);

    if (treeRasterLayer) {

      treeRasterLayer.setOpacity(
        value / 100
      );

    }

    treeOpacityValue.innerText =
      `${value}%`;

  }
);

// ============================================================
// reNDVI 圖例
// ============================================================

const legend = L.control({
  position: "bottomleft"
});

legend.onAdd = function () {

  const div =
    L.DomUtil.create(
      "div",
      "ndvi-legend"
    );

  div.style.background =
    "rgba(255,255,255,0.94)";

  div.style.padding =
    "8px 10px";

  div.style.borderRadius =
    "8px";

  div.style.boxShadow =
    "0 2px 8px rgba(0,0,0,0.15)";

  div.style.fontSize =
    "11px";

  div.style.color =
    "#475569";


  div.innerHTML = `

    <div style="
      font-size:12px;
      font-weight:700;
      color:#685A56;
      margin-bottom:6px;
    ">
      🌿 reNDVI
    </div>


    <div style="
      width:150px;
      height:10px;
      border-radius:999px;

      background:linear-gradient(
        90deg,
        #f7f7f7 0%,
        #eef5ec 25%,
        #d9f0d3 50%,
        #a1d99b 70%,
        #41ab5d 85%,
        #006d2c 100%
      );

      border:
        1px solid rgba(0,0,0,0.08);
    ">
    </div>


    <div style="
      width:150px;
      display:flex;
      justify-content:space-between;
      margin-top:3px;
      font-size:10px;
      font-weight:600;
    ">

      <span>-1</span>

      <span>0</span>

      <span>1</span>

    </div>

  `;


  L.DomEvent
    .disableClickPropagation(div);

  L.DomEvent
    .disableScrollPropagation(div);


  return div;
};

// ============================================================
// reNDVI 圖層開關 → 同步顯示 / 隱藏圖例
// ============================================================

map.on(
  "overlayadd",
  function(e) {

    if (
      ndviLayer &&
      e.layer === ndviLayer
    ) {

      legend.addTo(map);

    }

  }
);


map.on(
  "overlayremove",
  function(e) {

    if (
      ndviLayer &&
      e.layer === ndviLayer
    ) {

      legend.remove();

    }

  }
);

// ---------------- 變數 ----------------
let startLatLng=null, endLatLng=null;
let routeSelectionLocked = false;
let routeLegendVisible = false;

// ============================================================
// 路徑圖例
// ============================================================

const routeLegend =
  L.control({
    position: 'bottomleft'
  });


routeLegend.onAdd = function() {

  const div =
    L.DomUtil.create(
      'div',
      'route-legend'
    );

  div.innerHTML = `

    <div class="route-legend-title">
      路徑圖例
    </div>

    <div class="route-legend-row">
      <span
        class="route-legend-line"
        style="background:${ROUTE_COLORS.shortest}">
      </span>

      最短路徑
    </div>

    <div class="route-legend-row">
      <span
        class="route-legend-line"
        style="background:${ROUTE_COLORS.ndvi}">
      </span>

      最高綠暴露
    </div>

    <div class="route-legend-row">
      <span
        class="route-legend-line"
        style="background:${ROUTE_COLORS.gvi}">
      </span>

      最高綠視率
    </div>

  `;

  return div;
};


// ============================================================
// 路線著色漸層圖例
// ============================================================
let routeColorLegendVisible = false;

const routeColorLegend = L.control({ position:'bottomleft' });

routeColorLegend.onAdd = function(){
  const div = L.DomUtil.create('div','route-color-legend');
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  return div;
};

function formatRouteLegendValue(value, mode){
  const v = Number(value);
  if(!Number.isFinite(v)) return '—';
  if(mode === 'gvi') return `${v.toFixed(1).replace(/\.0$/,'')}%`;
  return v.toFixed(2).replace(/\.?0+$/,'');
}

function updateRouteColorLegend(mode){
  // 單色模式不顯示數值漸層圖例
  if(mode !== 'rendvi' && mode !== 'gvi'){
    if(routeColorLegendVisible){
      routeColorLegend.remove();
      routeColorLegendVisible = false;
    }
    return;
  }

  if(!routeColorLegendVisible){
    routeColorLegend.addTo(map);
    routeColorLegendVisible = true;
  }

  const div = routeColorLegend.getContainer();
  if(!div) return;

  const isRendvi = mode === 'rendvi';

  const low = isRendvi
    ? (Number.isFinite(currentRendviP05) ? currentRendviP05 : 0)
    : (Number.isFinite(currentGviP05) ? currentGviP05 : 0);

  const high = isRendvi
    ? (Number.isFinite(currentRendviP95) && currentRendviP95 > low ? currentRendviP95 : 1)
    : (Number.isFinite(currentGviP95) && currentGviP95 > low ? currentGviP95 : 100);

  const mid = (low + high) / 2;

  const gradient = isRendvi
    ? 'linear-gradient(90deg,#F6F4A9 0%,#B8E186 20%,#66C2A4 40%,#2A9D8F 60%,#2C7FB8 80%,#253494 100%)'
    : 'linear-gradient(90deg,#F4E66A 0%,#D7E96B 20%,#A7D96B 40%,#69C66B 60%,#2FA66B 80%,#147A63 100%)';

  div.innerHTML = `
    <div class="route-color-legend-title">
      ${isRendvi ? '🌿 路線綠暴露程度（reNDVI）' : '🌳 路線綠視率程度（GVI）'}
    </div>
    <div class="route-color-legend-gradient" style="background:${gradient};"></div>
    <div class="route-color-legend-labels">
      <span>${formatRouteLegendValue(low,mode)}</span>
      <span>${formatRouteLegendValue(mid,mode)}</span>
      <span>${formatRouteLegendValue(high,mode)}</span>
    </div>
  `;
}

// ============================================================
// 自訂起點 / 終點 Marker
// ============================================================

function createRouteMarker(label, color) {

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:32px;
        height:32px;
        border-radius:50%;
        background:${color};
        border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-size:14px;
        font-weight:800;
      ">
        ${label}
      </div>
    `,
    iconSize:[38,38],
    iconAnchor:[19,19]
  });

}

let startMarker=null, endMarker=null;
// ============================================================
// 起點 / 終點右鍵刪除
// ============================================================

function enableStartMarkerRightClick(marker) {

  marker.on('contextmenu', function (e) {

    // 防止事件繼續傳到地圖
    if (e.originalEvent) {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
    }

    // 移除起點 Marker
    if (startMarker && map.hasLayer(startMarker)) {
      map.removeLayer(startMarker);
    }

    startMarker = null;
    startLatLng = null;

    // 解除起訖點鎖定
    routeSelectionLocked = false;

    // 更新提示
    if (endLatLng) {

      pointInfo.innerText =
        `起點已刪除\n請重新設定起點`;

    } else {

      pointInfo.innerText =
        `請點選地圖以設定起點與終點`;

    }

  });

}


function enableEndMarkerRightClick(marker) {

  marker.on('contextmenu', function (e) {

    // 防止事件繼續傳到地圖
    if (e.originalEvent) {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
    }

    // 移除終點 Marker
    if (endMarker && map.hasLayer(endMarker)) {
      map.removeLayer(endMarker);
    }

    endMarker = null;
    endLatLng = null;

    // 解除起訖點鎖定
    routeSelectionLocked = false;

    // 更新提示
    if (startLatLng) {

      pointInfo.innerText =
        `終點已刪除\n請重新設定終點`;

    } else {

      pointInfo.innerText =
        `請點選地圖以設定起點與終點`;

    }

  });

}

const ROUTE_COLORS = {
  shortest: '#F2C94C',
  ndvi: '#8BC34A',
  gvi: '#087F5B'
};

let greenSpotMarkers = [];       // 目前顯示中的推薦點
let ndviGreenSpots = [];          // reNDVI 路徑 5 個推薦點
let gviGreenSpots = [];           // GVI 路徑 5 個推薦點
let streetViewMarkerEnabled = false; // 只有拖曳小黃人時才允許顯示相機
let pathLayers=[];               // 用來存放 polyline / markers 等，方便 reset
let shortestRouteLayers = [];
let ndviRouteLayers = [];
let gviRouteLayers = [];
let lastRouteFeatures = { shortest: null, ndvi: null, gvi: null };
let routeColorMode = 'solid';
let currentRouteDisplayMode = 'all';
let ndviLayer = null;
let ndviScale = null;
let footMarkers = [];           // 🔹 用來存放動畫腳丫 marker（可能兩個）
const speeds={walk:3,bike:15};
const scooterCarbonPerKm=50.8;

// ---------------- DOM ----------------
const pointInfo=document.getElementById('pointInfo');

// ============================================================
// 綠暴露增益
// ============================================================

const rendviBlock =  document.getElementById('rendviBlock');
const regviBlock =  document.getElementById('regviBlock');
const rendviPercent =  document.getElementById('rendviPercent');
const regviPercent =  document.getElementById('regviPercent');
const rendviFill =  document.getElementById('rendviFill');
const regviFill =  document.getElementById('regviFill');


// ============================================================
// 路徑資訊
// ============================================================

const shortInfo =  document.getElementById('shortInfo');
const ndviInfo =  document.getElementById('ndviInfo');
const gviInfo =  document.getElementById('gviInfo');
const ndviInfoRow =  document.getElementById('ndviInfoRow');
const gviInfoRow =  document.getElementById('gviInfoRow');

// ============================================================
// Carbon
// ============================================================

const shortCarbon =  document.getElementById('shortCarbon');
const ndviCarbon =  document.getElementById('ndviCarbon');
const gviCarbon =  document.getElementById('gviCarbon');
const ndviCarbonRow =  document.getElementById('ndviCarbonRow');
const gviCarbonRow =  document.getElementById('gviCarbonRow');

// ============================================================
// Street View
// ============================================================
let currentStreetViewLatLng = null;
let streetViewMarker = null;


const heightSlider = document.getElementById('heightSlider');
const heightVal = document.getElementById('heightVal');
const shortStepsVal=document.getElementById('shortStepsVal');
const ndviStepsVal=document.getElementById('ndviStepsVal');
const gviStepsVal=document.getElementById('gviStepsVal');

const ndviStepsBox=document.getElementById('ndviStepsBox');
const gviStepsBox=document.getElementById('gviStepsBox');

const kcalInfoVal=document.getElementById('kcalInfoVal');
const lifeInfoVal=document.getElementById('lifeInfoVal');

const healthGrid=document.getElementById('healthGrid');

const ndviResultTabBtn =  document.getElementById('ndviResultTabBtn');
const gviResultTabBtn =  document.getElementById('gviResultTabBtn');
let currentResultMetric = 'ndvi';

function showNdviResult() {

  currentResultMetric = 'ndvi';

  ndviResultTabBtn.classList.add('active');
  gviResultTabBtn.classList.remove('active');


  rendviBlock.style.display = 'block';
  regviBlock.style.display = 'none';


  ndviInfoRow.style.display = 'flex';
  gviInfoRow.style.display = 'none';


  ndviCarbonRow.style.display = 'flex';
  gviCarbonRow.style.display = 'none';


  ndviStepsBox.style.display = 'block';
  gviStepsBox.style.display = 'none';


  healthGrid.classList.remove('three-cols');
  healthGrid.classList.add('two-cols');


  infoView.classList.remove('mode-both');
  infoView.classList.add('mode-single');

}

function showGviResult() {

  currentResultMetric = 'gvi';

  ndviResultTabBtn.classList.remove('active');
  gviResultTabBtn.classList.add('active');


  rendviBlock.style.display = 'none';
  regviBlock.style.display = 'block';


  ndviInfoRow.style.display = 'none';
  gviInfoRow.style.display = 'flex';


  ndviCarbonRow.style.display = 'none';
  gviCarbonRow.style.display = 'flex';


  ndviStepsBox.style.display = 'none';
  gviStepsBox.style.display = 'block';


  healthGrid.classList.remove('three-cols');
  healthGrid.classList.add('two-cols');


  infoView.classList.remove('mode-both');
  infoView.classList.add('mode-single');

}

ndviResultTabBtn.addEventListener(
  'click',
  showNdviResult
);

gviResultTabBtn.addEventListener(
  'click',
  showGviResult
);


const infoView=document.getElementById('infoView');



// ============================================================
// 身高滑桿
// ============================================================

heightSlider.addEventListener('input', function () {

  // 更新畫面上的身高數字
  heightVal.innerText = this.value;

  // 重新計算步數、卡路里、健康效益
  updateHealthStats();

});

// ============================================================
// 地圖點擊：設定起點 / 終點
// ============================================================

map.on('click', e => {


  // ----------------------------------------------------------
  // 已經設定完成 → 不再允許透過點地圖重新設定
  // 只有「重新設定」按鈕才能解除鎖定
  // ----------------------------------------------------------

  if (routeSelectionLocked) {

    pointInfo.innerText =
      "起訖點已設定\n如需重新規劃，請點擊「重新設定」。";

    return;
  }


  // ----------------------------------------------------------
  // 設定起點
  // ----------------------------------------------------------

  if (!startLatLng) {

    startLatLng = e.latlng;

    if (startMarker) {
      map.removeLayer(startMarker);
    }

    startMarker = L.marker(startLatLng, {
      icon: createRouteMarker('A', '#15803d'),
      draggable: true
    }).addTo(map)
      .bindPopup(  isMobileView()    ? "起點 A<br><small>拖曳可調整位置</small>"    : "起點 A<br><small>拖曳可調整位置｜右鍵可刪除</small>")
      .openPopup();

    enableStartMarkerRightClick(startMarker);
    startMarker.on('dragend', ev => {

      startLatLng = ev.target.getLatLng();

      pointInfo.innerText =
        `起點已更新
(${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)})`;

    });

    pointInfo.innerText =
      `起點已設定
座標：(${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)})`;

    return;
  }


  // ----------------------------------------------------------
  // 設定終點
  // ----------------------------------------------------------

  if (!endLatLng) {

    endLatLng = e.latlng;

    if (endMarker) {
      map.removeLayer(endMarker);
    }

    endMarker = L.marker(endLatLng, {
      icon: createRouteMarker('B', '#f1d58b'),
      draggable: true
    }).addTo(map)
      .bindPopup(  isMobileView()    ? "終點 B<br><small>拖曳可調整位置</small>"    : "終點 B<br><small>拖曳可調整位置｜右鍵可刪除</small>")
      .openPopup();

    enableEndMarkerRightClick(endMarker);
    endMarker.on('dragend', ev => {

      endLatLng = ev.target.getLatLng();

      pointInfo.innerText =
        `終點已更新
起點：(${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)})
終點：(${endLatLng.lat.toFixed(5)}, ${endLatLng.lng.toFixed(5)})`;

    });

    pointInfo.innerText =
      `起點與終點已設定
起點：(${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)})
終點：(${endLatLng.lat.toFixed(5)}, ${endLatLng.lng.toFixed(5)})`;

    // ⭐ 起訖點完成後鎖定
    routeSelectionLocked = true;

    return;
  }

});

// ---------------- 定位按鈕（保留） ----------------
document.getElementById('locateBtn').addEventListener('click',()=>{
  if(!navigator.geolocation){ alert('無法使用定位'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude,longitude}=pos.coords;
    startLatLng=L.latLng(latitude,longitude);
    if(startMarker) map.removeLayer(startMarker);
    startMarker = L.marker(startLatLng, {
      icon: createRouteMarker('A', '#15803d'),
      draggable: true
    }).addTo(map).bindPopup("起點").openPopup();
    enableStartMarkerRightClick(startMarker);
    // 清除 Street View Marker
    if (streetViewMarker) {
      map.removeLayer(streetViewMarker);
      streetViewMarker = null;
    }
    startMarker.on('dragend', ev => { startLatLng = ev.target.getLatLng(); });
    map.setView(startLatLng,15);
    pointInfo.innerText=`已使用定位設定起點\n(${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
    
  }, err=>{ alert('定位失敗: '+ (err.message || err.code)); });
});

//https://storage.googleapis.com/run-sources-healthy-route-api-asia-east1/masked_PM25_HyLURXGB_2024_12_29_3826.img.tif
//https://storage.googleapis.com/run-sources-healthy-route-api-asia-east1/masked_masked_pm25_20_ProjectRaster.tif


// --- 貼在「定位按鈕」區塊之後 ---


// ============================================================
// Stadia Maps 地址自動完成
// ============================================================
//
// 使用方式：
// 1. 若你的 Stadia 專案已設定 domain-based authentication，
//    STADIA_API_KEY 保持空字串即可。
// 2. 若使用 API key，請把下方字串改成你的 Stadia Maps key。
// 3. Autocomplete 僅負責「輸入時推薦」；使用者選定後，
//    原本 Google Geocoding 仍負責取得精確座標，因此不破壞既有流程。
//
const STADIA_API_KEY = "";

const addrInput = document.getElementById('addrInput');
const addrSuggestions = document.getElementById('addrSuggestions');

let stadiaAutocompleteTimer = null;
let stadiaAutocompleteController = null;
let selectedSuggestionIndex = -1;
let currentAddressSuggestions = [];

function hideAddressSuggestions() {
  if (!addrSuggestions) return;
  addrSuggestions.classList.remove('show');
  addrSuggestions.innerHTML = '';
  addrInput?.setAttribute('aria-expanded', 'false');
  selectedSuggestionIndex = -1;
  currentAddressSuggestions = [];
}

function getSuggestionDisplay(feature) {
  const p = feature?.properties || {};
  const name = p.name || p.label || '';
  const context =
    p.coarse_location ||
    [
      p.street,
      p.locality || p.localadmin,
      p.region,
      p.country
    ].filter(Boolean).join('、');

  return { name, context };
}

function renderAddressSuggestions(features) {
  if (!addrSuggestions) return;

  currentAddressSuggestions = features || [];
  selectedSuggestionIndex = -1;

  if (!currentAddressSuggestions.length) {
    addrSuggestions.innerHTML =
      '<div class="addr-suggestion-status">找不到相近地點，請繼續輸入更完整的名稱或地址。</div>';
    addrSuggestions.classList.add('show');
    addrInput?.setAttribute('aria-expanded', 'true');
    return;
  }

  addrSuggestions.innerHTML = '';

  currentAddressSuggestions.forEach((feature, index) => {
    const display = getSuggestionDisplay(feature);
    const item = document.createElement('button');

    item.type = 'button';
    item.className = 'addr-suggestion-item';
    item.setAttribute('role', 'option');
    item.dataset.index = String(index);

    item.innerHTML = `
      <span class="addr-suggestion-name">${escapeHtml(display.name)}</span>
      ${
        display.context
          ? `<span class="addr-suggestion-context">${escapeHtml(display.context)}</span>`
          : ''
      }
    `;

    item.addEventListener('mousedown', function(e) {
      // 避免 input 先 blur 導致選單消失
      e.preventDefault();
    });

    item.addEventListener('click', function() {
      chooseAddressSuggestion(index);
    });

    addrSuggestions.appendChild(item);
  });

  addrSuggestions.classList.add('show');
  addrInput?.setAttribute('aria-expanded', 'true');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function chooseAddressSuggestion(index) {
  const feature = currentAddressSuggestions[index];
  if (!feature || !addrInput) return;

  const display = getSuggestionDisplay(feature);

  // 把主要名稱 + 地區提示放回輸入框，後續沿用原本 geocodeAddress。
  addrInput.value =
    [display.name, display.context]
      .filter(Boolean)
      .join(' ');

  hideAddressSuggestions();
  addrInput.focus();
}

function updateSuggestionKeyboardState() {
  const items = addrSuggestions?.querySelectorAll('.addr-suggestion-item') || [];

  items.forEach((item, index) => {
    item.classList.toggle('active', index === selectedSuggestionIndex);
  });

  if (
    selectedSuggestionIndex >= 0 &&
    items[selectedSuggestionIndex]
  ) {
    items[selectedSuggestionIndex].scrollIntoView({
      block: 'nearest'
    });
  }
}

async function requestStadiaAutocomplete(text) {
  const raw = String(text || '').trim();

  if (raw.length < 2) {
    hideAddressSuggestions();
    return;
  }

  if (stadiaAutocompleteController) {
    stadiaAutocompleteController.abort();
  }

  stadiaAutocompleteController = new AbortController();

  const params = new URLSearchParams({
    text: raw,
    lang: 'zh-TW',
    size: '8',

    // 以嘉義市中心作為排序偏好；仍可搜尋地址、道路、POI。
    'focus.point.lat': '23.4807',
    'focus.point.lon': '120.4491',

    // 限制在台灣，避免輸入短字串時跑出國外同名地點。
    'boundary.country': 'TWN'
  });

  if (STADIA_API_KEY) {
    params.set('api_key', STADIA_API_KEY);
  }

  const url =
    'https://api.stadiamaps.com/geocoding/v2/autocomplete?' +
    params.toString();

  try {
    const response = await fetch(url, {
      signal: stadiaAutocompleteController.signal
    });

    if (!response.ok) {
      throw new Error(`Stadia autocomplete HTTP ${response.status}`);
    }

    const data = await response.json();
    renderAddressSuggestions(data.features || []);
  }
  catch (error) {
    if (error?.name === 'AbortError') return;

    console.warn('Stadia autocomplete 暫時不可用：', error);

    if (addrSuggestions) {
      addrSuggestions.innerHTML =
        '<div class="addr-suggestion-status">地址建議暫時無法載入；仍可直接輸入完整地址後按「設為起點／終點」。</div>';
      addrSuggestions.classList.add('show');
      addrInput?.setAttribute('aria-expanded', 'true');
    }
  }
}

if (addrInput && addrSuggestions) {
  addrInput.addEventListener('input', function() {
    window.clearTimeout(stadiaAutocompleteTimer);

    stadiaAutocompleteTimer = window.setTimeout(() => {
      requestStadiaAutocomplete(addrInput.value);
    }, 260);
  });

  addrInput.addEventListener('keydown', function(e) {
    if (!addrSuggestions.classList.contains('show')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex = Math.min(
        selectedSuggestionIndex + 1,
        currentAddressSuggestions.length - 1
      );
      updateSuggestionKeyboardState();
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex = Math.max(
        selectedSuggestionIndex - 1,
        0
      );
      updateSuggestionKeyboardState();
    }
    else if (
      e.key === 'Enter' &&
      selectedSuggestionIndex >= 0
    ) {
      e.preventDefault();
      chooseAddressSuggestion(selectedSuggestionIndex);
    }
    else if (e.key === 'Escape') {
      hideAddressSuggestions();
    }
  });

  addrInput.addEventListener('focus', function() {
    if (currentAddressSuggestions.length) {
      addrSuggestions.classList.add('show');
      addrInput.setAttribute('aria-expanded', 'true');
    }
  });

  document.addEventListener('pointerdown', function(e) {
    if (
      !addrInput.contains(e.target) &&
      !addrSuggestions.contains(e.target)
    ) {
      hideAddressSuggestions();
    }
  });
}


// ---------------- Google Maps 地址轉換 ----------------

async function geocodeAddress(address) {

  // Google Geocoding API Key
  const googleKey = "AIzaSyCQGlyAvg-xDSWPbhYbvnk8X8FLfSmUbWg";


  // ============================================================
  // 1. 地址補全
  // 如果使用者沒有輸入「嘉義市」，自動補上
  // ============================================================

  let queryAddr = address.trim();

  const hasChiayiCity =
    queryAddr.includes("嘉義市");


  if (!hasChiayiCity) {

    queryAddr =
      "嘉義市" + queryAddr;

  }


  console.log(
    "地址搜尋：",
    queryAddr
  );


  // ============================================================
  // 2. Google Geocoding
  // ============================================================

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${
      encodeURIComponent(queryAddr)
    }&key=${
      googleKey
    }&language=zh-TW&region=tw`;


  try {

    const response =
      await fetch(url);

    const data =
      await response.json();


    if (data.status === "OK") {

      const result =
        data.results[0];

      const formattedAddress =
        result.formatted_address;


      console.log(
        "Google 搜尋結果：",
        formattedAddress
      );


      // ========================================================
      // 3. 限制搜尋結果必須位於嘉義市
      // ========================================================

      if (
        formattedAddress.includes("嘉義市")
      ) {

        return {

          lat:
            result.geometry.location.lat,

          lng:
            result.geometry.location.lng,

          formatAddress:
            formattedAddress

        };

      }


      // Google 找到了，但不是嘉義市
      else {

        alert(
          "搜尋結果不在嘉義市範圍內，請重新輸入。"
        );

        return null;

      }

    }


    // ==========================================================
    // 找不到地址
    // ==========================================================

    else if (
      data.status === "ZERO_RESULTS"
    ) {

      alert(
        "Google 找不到該地址，請檢查輸入是否有誤。"
      );

      return null;

    }


    // ==========================================================
    // Google API 其他錯誤
    // ==========================================================

    else {

      throw new Error(
        data.error_message ||
        data.status
      );

    }

  }


  catch (error) {

    console.error(
      "Google Geocoding 錯誤:",
      error
    );

    alert(
      "地址搜尋暫時不可用，請直接點擊地圖設定。"
    );

    return null;

  }

}

// 綁定「設為起點」按鈕
document.getElementById('setStartByAddr').addEventListener('click', async () => {
  const addr = document.getElementById('addrInput').value;
  if (!addr) { alert("請輸入地址"); return; }
  
  const coords = await geocodeAddress(addr);
  if (coords) {
    startLatLng = L.latLng(coords.lat, coords.lng);
    if (startMarker) map.removeLayer(startMarker);
    
    startMarker = L.marker(startLatLng, {
      icon: createRouteMarker('A', '#15803d'),
      draggable: true
    }).addTo(map).bindPopup("起點").openPopup();
    enableStartMarkerRightClick(startMarker);    
    // 同步更新拖曳事件
    startMarker.on('dragend', ev => {
      startLatLng = ev.target.getLatLng();
      pointInfo.innerText = `起點已更新\n座標：(${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)})`;
    });

    map.setView(startLatLng, 16);
    pointInfo.innerText = `起點已設定（Google 定位）\n地址：${coords.formatAddress}`;
  }
});

// 綁定「設為終點」按鈕
document.getElementById('setEndByAddr').addEventListener('click', async () => {
  const addr = document.getElementById('addrInput').value;
  if (!addr) { alert("請輸入地址"); return; }
  
  const coords = await geocodeAddress(addr);
  if (coords) {
    endLatLng = L.latLng(coords.lat, coords.lng);
    if (endMarker) map.removeLayer(endMarker);
    
    endMarker = L.marker(endLatLng, {
      icon: createRouteMarker('B', '#f1d58b'),
      draggable: true
    }).addTo(map).bindPopup("終點").openPopup();
    enableEndMarkerRightClick(endMarker);
    endMarker.on('dragend', ev => {
      endLatLng = ev.target.getLatLng();
      pointInfo.innerText = `終點已更新\n座標：(${endLatLng.lat.toFixed(5)}, ${endLatLng.lng.toFixed(5)})`;
    });

    map.setView(endLatLng, 16);
    pointInfo.innerText = `終點已設定（Google 定位）\n地址：${coords.formatAddress}`;
  }
});

// ============================================================
// NDVI 圖層
// ============================================================

const NDVI_TIF_URL =
  "https://storage.googleapis.com/chiayi_ndvi/NDVI_Chiayi.tif";

console.log("開始載入 NDVI GeoTIFF...");
console.log("NDVI URL:", NDVI_TIF_URL);

fetch(NDVI_TIF_URL)
  .then(function(response) {

    console.log("NDVI HTTP 狀態:", response.status);

    if (!response.ok) {
      throw new Error(
        "NDVI GeoTIFF 下載失敗，HTTP " + response.status
      );
    }

    return response.arrayBuffer();
  })

  .then(function(arrayBuffer) {

    console.log(
      "NDVI GeoTIFF 下載完成，大小:",
      arrayBuffer.byteLength,
      "bytes"
    );

    return parseGeoraster(arrayBuffer);
  })

  .then(function(georaster) {

    console.log("NDVI GeoRaster 解析成功");
    console.log("NDVI GeoRaster:", georaster);

    // ------------------------------------------------
    // 檢查資料
    // ------------------------------------------------

    if (!georaster.values || !georaster.values[0]) {
      throw new Error("GeoTIFF 沒有讀取到 raster values");
    }

    var values = georaster.values[0];

    console.log(
      "NDVI raster 高度:",
      values.length
    );

    console.log(
      "NDVI raster 寬度:",
      values[0] ? values[0].length : 0
    );

    // ------------------------------------------------
    // 找 NDVI 最小值 / 最大值
    // ------------------------------------------------

    var min = Infinity;
    var max = -Infinity;

    for (var r = 0; r < values.length; r++) {

      for (var c = 0; c < values[r].length; c++) {

        var v = values[r][c];

        if (
          v !== null &&
          v !== undefined &&
          !isNaN(v) &&
          v !== -9999
        ) {

          // NDVI 合理範圍
          if (v >= -1 && v <= 1) {

            if (v < min) {
              min = v;
            }

            if (v > max) {
              max = v;
            }

          }
        }
      }
    }

    // ------------------------------------------------
    // 如果沒有找到有效值
    // ------------------------------------------------

    if (
      min === Infinity ||
      max === -Infinity
    ) {

      console.warn(
        "沒有找到 NDVI 有效值"
      );

      min = -1;
      max = 1;
    }

    console.log(
      "NDVI 真實範圍:",
      min,
      max
    );

    // ------------------------------------------------
    // NDVI 顏色
    //
    // 固定使用 -1 ~ 1
    // 低 NDVI = 淺色
    // 高 NDVI = 深綠
    // ------------------------------------------------

    ndviScale = chroma
      .scale([
        "#f7f7f7",   // -1.0
        "#eef5ec",   // -0.5
        "#d9f0d3",   //  0.0
        "#a1d99b",   //  0.25
        "#41ab5d",   //  0.5
        "#006d2c"    //  1.0
      ])
      .domain([-1, 1]);

    console.log(
      "NDVI 色階建立完成，固定範圍：-1 ~ 1"
    );

    // ------------------------------------------------
    // 建立 GeoRasterLayer
    // ------------------------------------------------

    ndviLayer = new GeoRasterLayer({

      georaster: georaster,

      opacity: 0.6,

      resolution: 128,

      pixelValuesToColorFn: function(values) {

        var v = values[0];

        // --------------------------------------------
        // NoData / 無效值
        // --------------------------------------------

        if (
          v === null ||
          v === undefined ||
          !Number.isFinite(v) ||
          v === -9999
        ) {
          return null;
        }

      
        // --------------------------------------------
        // NDVI 合理範圍
        // --------------------------------------------

        if (v < -1 || v > 1) {
          return null;
        }

        // --------------------------------------------
        // 限制到 -1 ～ 1
        // --------------------------------------------

        v = Math.max(-1, Math.min(1, v));

        return ndviScale(v).hex();
      }

    });

    console.log(
      "NDVI GeoRasterLayer 建立完成:",
      ndviLayer
    );

    // ------------------------------------------------
    // 加入 Leaflet 圖層控制
    // ------------------------------------------------

    // 將 reNDVI raster 加回「綠色健康圖層」
    overlayMaps["綠暴露（reNDVI）"] = ndviLayer;
    layerControl.addOverlay(
      ndviLayer,
      "綠暴露（reNDVI）"
    );

    console.log(
      "綠暴露（reNDVI）已加入圖層控制"
    );

    /* 等桌機版 Flex 版面完成計算後，重新繪製 NDVI */
    setTimeout(() => {
      map.invalidateSize();

      if (ndviLayer && map.hasLayer(ndviLayer)) {
        ndviLayer.redraw();
      }
    }, 400);

    // ------------------------------------------------
    // 固定嘉義市中心
    // ------------------------------------------------

    map.setView(
      [23.4807, 120.4491],
      13
    );

    console.log(
      "地圖中心設定為嘉義市"
    );

  })

  .catch(function(error) {

    console.error(
      "================================"
    );

    console.error(
      "NDVI 載入失敗"
    );

    console.error(
      error
    );

    console.error(
      "================================"
    );

  });

// ---------------- Reset ----------------
document.getElementById('resetBtn').addEventListener('click', () => {
  // 1. 移除起終點
  if (startMarker) {
    map.removeLayer(startMarker);
    startMarker = null;
  }
  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }

  startLatLng = null;
  endLatLng = null;
  routeSelectionLocked = false;

  // 2. 移除路徑
  pathLayers.forEach(layer => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });

  pathLayers = [];
  clearGreenSpotMarkers();
  ndviGreenSpots = [];
  gviGreenSpots = [];
  shortestRouteLayers = [];
  ndviRouteLayers = [];
  gviRouteLayers = [];

  if (routeLegendVisible) {

    routeLegend.remove();

    routeLegendVisible = false;

  }

  if (routeColorLegendVisible) {
    routeColorLegend.remove();
    routeColorLegendVisible = false;
  }

  // 路徑顯示按鈕恢復成「全部」
  setRouteDisplayButtonActive('all');
  mobilePathOptions.forEach(
    function(btn) {

      btn.classList.toggle(
        'active',
        btn.dataset.mobileRoute === 'all'
      );

    }
  );

  mobilePathPopup.classList.remove('show');
  // 隱藏路徑顯示控制區
  routeDisplayControl.style.display = 'none';

  // 3. 移除動畫
  footMarkers.forEach(marker => {
    if (map.hasLayer(marker)) map.removeLayer(marker);
  });
  footMarkers = [];

  // 4. 移除 Street View Marker
  if (streetViewMarker) {
    map.removeLayer(streetViewMarker);
    streetViewMarker = null;
  }
  currentStreetViewLatLng = null;

  // 5. 重置距離
  currentShortDist = 0;
  currentNdviDist = 0;
  currentGviDist = 0;

  // 6. 重置距離 / 時間
  shortInfo.innerText = "—";
  ndviInfo.innerText = "—";
  gviInfo.innerText = "—";

  // 7. 重置碳排
  shortCarbon.innerText = "—";
  ndviCarbon.innerText = "—";
  gviCarbon.innerText = "—";

  // 8. 重置 RENDVI / REGVI
  setRendvi(0);
  setRegvi(0);

  // 9. 重置步數
  document.getElementById('shortStepsVal').innerText = "0";
  document.getElementById('ndviStepsVal').innerText = "0";
  document.getElementById('gviStepsVal').innerText = "0";

  document.getElementById('kcalInfoVal').innerText="0.0 kcal";
  document.getElementById('lifeInfoVal').innerText="0.0 分鐘";

  // 12. 回到初始狀態
  pointInfo.innerText = "請點選地圖以設定起點與終點";
  showNdviResult();
  updateHealthStats();
});

// ---------------- 工具函式：距離、時間、碳排 ----------------
function fixMapSize() {
  setTimeout(() => {
    map.invalidateSize();
  }, 200);
}

function updateHealthStats() {

  const h_cm =
    parseInt(heightSlider.value);

  const stepLen =
    (h_cm / 100) * 0.43;

  const shortSteps =
    currentShortDist > 0
      ? Math.round(currentShortDist / stepLen)
      : 0;

  const ndviSteps =
    currentNdviDist > 0
      ? Math.round(currentNdviDist / stepLen)
      : 0;

  const gviSteps =
    currentGviDist > 0
      ? Math.round(currentGviDist / stepLen)
      : 0;


  shortStepsVal.innerText =
    shortSteps + " 步";

  ndviStepsVal.innerText =
    ndviSteps + " 步";

  gviStepsVal.innerText =
    gviSteps + " 步";


  let healthSteps = 0;


  if (currentResultMetric === 'ndvi') {

    ndviStepsBox.style.display = 'block';
    gviStepsBox.style.display = 'none';

    healthSteps = ndviSteps;

  }
  else {

    ndviStepsBox.style.display = 'none';
    gviStepsBox.style.display = 'block';

    healthSteps = gviSteps;

  }


  kcalInfoVal.innerText =
    (healthSteps * 0.04).toFixed(1)
    + " kcal";

  lifeInfoVal.innerText =
    (healthSteps * 0.004).toFixed(1)
    + " 分鐘";


  healthGrid.classList.remove(
    'three-cols'
  );

  healthGrid.classList.add(
    'two-cols'
  );

}


window.addEventListener("resize", fixMapSize);
window.addEventListener("orientationchange", fixMapSize);
function calcDistance(coords){
  let total=0;
  for(let i=1;i<coords.length;i++){
    total += L.latLng(coords[i-1][0], coords[i-1][1]).distanceTo(L.latLng(coords[i][0], coords[i][1]));
  }
  return total;
}
function metersToMinutes(m,mode){ return (m/1000)/speeds[mode]*60; }
function calcCarbonSaving(m){  return (m/1000)*scooterCarbonPerKm;}
function setRendvi(value) {

  const v =
    Number.isFinite(Number(value))
      ? Number(value)
      : 0;

  rendviPercent.innerText =
    `${v.toFixed(2)}%`;

  // Progress bar 最大顯示 100%，
  // 但文字仍可正常顯示 >100% 的 RENDVI
  const width =
    Math.max(
      0,
      Math.min(
        Math.abs(v),
        100
      )
    );

  rendviFill.style.width =
    `${width}%`;

  rendviFill.innerText =
    `${v.toFixed(1)}%`;
}


function setRegvi(value){
  const v = Number.isFinite(Number(value)) ? Number(value) : 0;

  // GVI 提升率超過 1000% 時改以「倍」顯示：
  // 例如 1600% = 16倍；1000% 本身仍維持百分比顯示。
  const displayText =
    Math.abs(v) > 1000
      ? `${v >= 0 ? '+' : '-'}${(Math.abs(v) / 100).toFixed(1).replace(/\.0$/, '')}倍`
      : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  regviPercent.innerText = displayText;

  // 進度條視覺寬度仍限制在 0~100%，避免超出卡片。
  const width = Math.max(0, Math.min(Math.abs(v), 100));
  regviFill.style.width = `${width}%`;

  // 進度條內文字也同步採相同顯示規則。
  regviFill.innerText = displayText;
}


// ---------------- Gauge 畫面函式（保留） ----------------
function drawGauge(canvasId, value, maxValue){
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const radius = w/2 - 10;
  const startAngle = Math.PI*0.75;
  const endAngle = Math.PI*0.25 + 2*Math.PI;
  const percent = Math.min(value/maxValue,1);

  ctx.clearRect(0,0,w,h);

  ctx.beginPath();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#e6edf6';
  ctx.arc(w/2, h/2, radius, startAngle, endAngle);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = '#10b981';
  ctx.arc(w/2, h/2, radius, startAngle, startAngle + percent*(endAngle-startAngle));
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(value) + ' 步', w/2, h/2);
}

// ---------------- 🔹 新增：腳丫動畫函式（可建立多個腳丫 marker） ----------------
function spawnFootMarker(coords, color){
  // small custom SVG icon so marker is lightweight and colored if needed
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
      <path fill="${color||'#1e3a8a'}" d="M7.5 3C7.78 3 8 3.22 8 3.5V5.5C8 5.78 7.78 6 7.5 6S7 5.78 7 5.5V3.5C7 3.22 7.22 3 7.5 3zM12 3c.28 0 .5.22.5.5v2c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-2c0-.28.22-.5.5-.5zM16.5 4c.28 0 .5.22.5.5v2c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-2c0-.28.22-.5.5-.5zM9.5 9.5c1.5-.5 3 .1 3 1.5 0 1.4-1 2.5-2.5 3s-2.5 1-3 1c-1 0-2-1-2-2.5 0-1.5 1-2.5 2.5-3 0 0 .5-.2 .5-.5zM18 11c1.1 0 2 .9 2 2 0 3.3-1.9 6-5 6-1.6 0-3-2-3-3 0-1.9 1.7-3.5 4-4z"/>
    </svg>`);
  const icon = L.icon({
    iconUrl: "data:image/svg+xml;charset=utf-8," + svg,
    iconSize: [28,28],
    iconAnchor: [14,14]
  });
  const m = L.marker(coords[0], {icon, interactive:false}).addTo(map);
  footMarkers.push(m);
  // animate using requestAnimationFrame for smoother movement
  let idx = 0;
  function step(){
    if(!m) return;
    if(idx < coords.length){
      m.setLatLng(coords[idx]);
      idx++;
      // speed: bigger step = faster; adjust by using modulus or step size
      requestAnimationFrame(step);
    } else {
      // keep last position for a short while then remove
      setTimeout(()=>{ if(map.hasLayer(m)) map.removeLayer(m); const i = footMarkers.indexOf(m); if(i>-1) footMarkers.splice(i,1); }, 800);
    }
  }
  step();
  return m;
}


// ============================================================
// 路線高綠意推薦點
// ============================================================

function clearGreenSpotMarkers() {
  greenSpotMarkers.forEach(marker => {
    if (marker && map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
  });
  greenSpotMarkers = [];
}

function createGreenSpotIcon(rank, routeType) {
  const pointColor =
    routeType === 'ndvi'
      ? ROUTE_COLORS.ndvi
      : ROUTE_COLORS.gvi;

  return L.divIcon({
    className: 'green-spot-marker',
    html: `
      <div
        class="green-spot-dot"
        style="
          background:${pointColor};
          color:#ffffff;
        "
      >${rank}</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11]
  });
}

function addGreenSpotMarkers(spots, routeType, clearExisting = true) {
  if (clearExisting) {
    clearGreenSpotMarkers();
  }

  const routeLabel =
    routeType === 'ndvi'
      ? 'reNDVI 路徑'
      : 'GVI 路徑';

  (spots || []).slice(0, 5).forEach((spot, index) => {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const gviText = Number.isFinite(Number(spot.gvi_percent))
      ? `${Number(spot.gvi_percent).toFixed(1)}%`
      : '—';

    const ndviText = Number.isFinite(Number(spot.ndvi))
      ? Number(spot.ndvi).toFixed(2)
      : '—';

    const marker = L.marker([lat, lng], {
      icon: createGreenSpotIcon(index + 1, routeType),
      zIndexOffset: 1500,
      keyboard: true,
      title: `${routeLabel}推薦點 ${index + 1}`
    }).addTo(map);

    // 桌機：滑鼠移到推薦點上就顯示資訊，不必先點擊。
    // 手機沒有 hover，點擊仍會直接開啟街景。
    marker.bindTooltip(`
      <div class="green-spot-popup">
        <div class="green-spot-popup-title">🌳 ${routeLabel}推薦點 ${index + 1}</div>
        <div>GVI：${gviText}</div>
        <div>reNDVI：${ndviText}</div>
        <div class="green-spot-popup-note">點擊圓點即可直接查看此處附近街景</div>
      </div>
    `, {
      direction: 'top',
      offset: [0, -12],
      opacity: 0.98,
      sticky: false,
      className: 'green-spot-tooltip'
    });

    marker.on('click', function() {
      // 推薦景點：直接開街景，但不在 Leaflet 地圖建立相機圖示。
      streetViewMarkerEnabled = false;

      if (streetViewMarker && map.hasLayer(streetViewMarker)) {
        map.removeLayer(streetViewMarker);
      }
      streetViewMarker = null;

      openStreetViewModal();
      showStreetView(lat, lng, false);
    });

    greenSpotMarkers.push(marker);
  });
}

function updateGreenSpotMarkersForRouteMode(mode) {
  if (mode === 'ndvi') {
    // 最高綠暴露：只顯示 reNDVI 路徑的 5 個推薦點
    addGreenSpotMarkers(ndviGreenSpots, 'ndvi', true);
  }
  else if (mode === 'gvi') {
    // 最高綠視率：只顯示 GVI 路徑的 5 個推薦點
    addGreenSpotMarkers(gviGreenSpots, 'gvi', true);
  }
  else {
    // 全部：同時顯示 reNDVI 5 點 + GVI 5 點
    clearGreenSpotMarkers();

    addGreenSpotMarkers(
      ndviGreenSpots,
      'ndvi',
      false
    );

    addGreenSpotMarkers(
      gviGreenSpots,
      'gvi',
      false
    );
  }
}

// ============================================================
// 綠色導航路徑規劃
//
// greenMode：
// ndvi → 最短 + NDVI
// gvi  → 最短 + GVI
// both → 最短 + NDVI + GVI
// ============================================================

document
  .getElementById('dualPathBtn')
  .addEventListener(
    'click',
    async function drawGreenRoute() {


      // ======================================================
      // 手機版先關閉面板
      // ======================================================

      if (window.innerWidth <= 1024) {
        closeMobilePanels();
      }


      // ======================================================
      // 起終點檢查
      // ======================================================

      if (!startLatLng || !endLatLng) {

        alert(
          '請先設定起點與終點'
        );

        return;
      }

      // ============================================================
      // 按下規劃路徑後：Popup 只保留起點 / 終點名稱
      // ============================================================

      if (startMarker) {

        startMarker.setPopupContent("起點 A");

        if (startMarker.dragging) {
          startMarker.dragging.disable();
        }

      }

      if (endMarker) {

        endMarker.setPopupContent("終點 B");

        if (endMarker.dragging) {
          endMarker.dragging.disable();
        }

      }
  
      // ======================================================
      // 清除上一輪路徑
      // ======================================================

      pathLayers.forEach(layer => {

        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }

      });

      pathLayers = [];

      clearGreenSpotMarkers();

    if (routeLegendVisible) {
      routeLegend.remove();
      routeLegendVisible = false;
    }

    if (routeColorLegendVisible) {
      routeColorLegend.remove();
      routeColorLegendVisible = false;
    }


      // 清除動畫
      footMarkers.forEach(marker => {

        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }

      });

      footMarkers = [];


      // ======================================================
      // 讀取使用者設定
      // ======================================================

      // 交通方式
      const transportMode =
        document
          .getElementById('modeSelect')
          .value;


      // 綠色導航模式
      const greenMode = 'both';


      console.log(
        "交通方式:",
        transportMode
      );

      console.log(
        "綠色導航模式:",
        greenMode
      );


      // ======================================================
      // API URL
      // ======================================================

      const url =
        `https://healthy-route-api-995293427533.asia-east1.run.app/route`
        +
        `?start_lat=${startLatLng.lat}`
        +
        `&start_lon=${startLatLng.lng}`
        +
        `&end_lat=${endLatLng.lat}`
        +
        `&end_lon=${endLatLng.lng}`
        +
        `&mode=${greenMode}`;


      const routeSettings={start:{lat:startLatLng.lat,lng:startLatLng.lng},end:{lat:endLatLng.lat,lng:endLatLng.lng},mode:transportMode,extra_minutes:transportMode==='walk'?(Number(document.getElementById('extraMinutes')?.value)||null):null};
      const restoredData=window.chiayiPendingSnapshot;
      window.chiayiPendingSnapshot=null;
      window.dispatchEvent(new Event('chiayi-route-planning'));
      try {

        // ====================================================
        // 呼叫 API
        // ====================================================

        const res =
          restoredData ? {ok:true,json:async()=>restoredData} : await fetch(url);


        if (!res.ok) {

          const txt =
            await res.text();

          throw new Error(
            'API 回傳錯誤: ' + txt
          );

        }


        const data =
          await res.json();


        console.log(
          "API response:",
          data
        );


        // ====================================================
        // API 路徑
        // ====================================================

        const shortest =
          data.shortest_path;

        const highNDVI =
          data.high_ndvi_path || null;

        const highGVI =
          data.high_gvi_path || null;

        // reNDVI 與 GVI 各自有 5 個推薦點
        ndviGreenSpots =
          Array.isArray(data.ndvi_green_spots)
          ? data.ndvi_green_spots
          : [];

        gviGreenSpots =
          Array.isArray(data.gvi_green_spots)
          ? data.gvi_green_spots
          : [];

        // 保留 API 回傳的完整路線與逐路段 reNDVI / GVI，
        // 供「單色 / reNDVI 漸層 / GVI 漸層」即時切換。
        lastRouteFeatures = {
          shortest: shortest,
          ndvi: highNDVI,
          gvi: highGVI
        };
        window.lastRouteFeatures = lastRouteFeatures;
        window.dispatchEvent(new CustomEvent('chiayi-route-ready',{detail:{settings:routeSettings,data,restored:!!restoredData}}));


        // ====================================================
        // Gain
        //
        // 如果 API 最後使用：
        // RENDVI / REGVI
        // ====================================================

        const rendvi =
          data.RENDVI ?? 0;

        const regvi =
          data.REGVI ?? 0;


        // ====================================================
        // 根據模式控制成果面板
        // ====================================================

        rendviBlock.style.display =
          (
            greenMode === 'ndvi'
            ||
            greenMode === 'both'
          )
          ? 'block'
          : 'none';


        regviBlock.style.display =
          (
            greenMode === 'gvi'
            ||
            greenMode === 'both'
          )
          ? 'block'
          : 'none';


        ndviInfoRow.style.display =
          (
            greenMode === 'ndvi'
            ||
            greenMode === 'both'
          )
          ? 'flex'
          : 'none';


        gviInfoRow.style.display =
          (
            greenMode === 'gvi'
            ||
            greenMode === 'both'
          )
          ? 'flex'
          : 'none';


        ndviCarbonRow.style.display =
          (
            greenMode === 'ndvi'
            ||
            greenMode === 'both'
          )
          ? 'flex'
          : 'none';


        gviCarbonRow.style.display =
          (
            greenMode === 'gvi'
            ||
            greenMode === 'both'
          )
          ? 'flex'
          : 'none';


        // ====================================================
        // Gain 顯示
        // ====================================================

        if (
          greenMode === 'ndvi'
          ||
          greenMode === 'both'
        ) {

          setRendvi(
            rendvi
          );

        }


        if (
          greenMode === 'gvi'
          ||
          greenMode === 'both'
        ) {

          setRegvi(
            regvi
          );

        }


        // ====================================================
        // Bounds
        // ====================================================

        const bounds =
          L.latLngBounds([
            startLatLng,
            endLatLng
          ]);


        // ====================================================
        // Carbon
        // ====================================================

        function getCarbonDisplay(meter){
          const saving=calcCarbonSaving(meter);
          return `-${saving.toFixed(1)} g CO₂`;
        }

        // ====================================================
        // 共用：取得路徑距離
        //
        // 優先直接使用 API PKL 算出的 length_m
        // ====================================================

        function getRouteDistance(
          feature,
          coords
        ) {

          const length =
            feature
            &&
            feature.properties
            &&
            Number(
              feature.properties.length_m
            );


          if (
            Number.isFinite(length)
            &&
            length > 0
          ) {

            return length;

          }


          return calcDistance(
            coords
          );

        }


        // ====================================================
        // 1. 最短路徑
        // ====================================================

        if (shortest) {


          const coords =
            shortest.geometry
            &&
            shortest.geometry.coordinates
            ?
            shortest.geometry.coordinates.map(
              c => [c[1], c[0]]
            )
            :
            [];


          currentShortDist =
            getRouteDistance(
              shortest,
              coords
            );


          // 外框
          const shortOutline =
            L.polyline(
              coords,
              {
                color: '#7f1d1d',
                weight: 9,
                opacity: 0.65,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);

          // 主線
          const shortLine =
            L.polyline(
              coords,
              {
                color: ROUTE_COLORS.shortest,
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);


          pathLayers.push(
            shortOutline,
            shortLine
          );

          shortestRouteLayers = [
            shortOutline,
            shortLine
          ];

          shortInfo.innerText =
            currentShortDist > 0
            ?
            `${Math.round(currentShortDist)} m / ${
              metersToMinutes(
                currentShortDist,
                transportMode
              ).toFixed(1)
            } 分`
            :
            "—";


          shortCarbon.innerText =
            getCarbonDisplay(
              currentShortDist
            );


          bounds.extend(
            coords
          );


          if (
            transportMode === 'walk'
          ) {

            spawnFootMarker(
              coords,
              '#f1d58b'
            );

          }

        }


        // ====================================================
        // 2. 高綠暴露路徑
        // ====================================================

        currentNdviDist = 0;


        if (highNDVI) {


          const coords =
            highNDVI.geometry
            &&
            highNDVI.geometry.coordinates
            ?
            highNDVI.geometry.coordinates.map(
              c => [c[1], c[0]]
            )
            :
            [];


          currentNdviDist =
            getRouteDistance(
              highNDVI,
              coords
            );


          // 外框
          const ndviOutline =
            L.polyline(
              coords,
              {
                color: '#14532d',
                weight: 9,
                opacity: 0.65,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);

          // 主線
          const ndviLine =
            L.polyline(
              coords,
              {
                color: ROUTE_COLORS.ndvi,
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);


          pathLayers.push(
            ndviOutline,
            ndviLine
          );

          ndviRouteLayers = [
            ndviOutline,
            ndviLine
          ];

          ndviInfo.innerText =
            currentNdviDist > 0
            ?
            `${Math.round(currentNdviDist)} m / ${
              metersToMinutes(
                currentNdviDist,
                transportMode
              ).toFixed(1)
            } 分`
            :
            "—";


          ndviCarbon.innerText =
            getCarbonDisplay(
              currentNdviDist
            );


          bounds.extend(
            coords
          );


          if (
            transportMode === 'walk'
          ) {

            spawnFootMarker(
              coords,
              ROUTE_COLORS.ndvi
            );

          }

        }


        // ====================================================
        // 3. 高綠視率路徑
        // ====================================================

        currentGviDist = 0;


        if (highGVI) {


          const coords =
            highGVI.geometry
            &&
            highGVI.geometry.coordinates
            ?
            highGVI.geometry.coordinates.map(
              c => [c[1], c[0]]
            )
            :
            [];


          currentGviDist =
            getRouteDistance(
              highGVI,
              coords
            );


          // 外框
          const gviOutline =
            L.polyline(
              coords,
              {
                color: '#064E3B',
                weight: 9,
                opacity: 0.65,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);

          // 主線
          const gviLine =
            L.polyline(
              coords,
              {
                color: ROUTE_COLORS.gvi,
                weight: 5,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
                interactive: false
              }
            ).addTo(map);


          pathLayers.push(
            gviOutline,
            gviLine
          );

          gviRouteLayers = [
            gviOutline,
            gviLine
          ];

          gviInfo.innerText =
            currentGviDist > 0
            ?
            `${Math.round(currentGviDist)} m / ${
              metersToMinutes(
                currentGviDist,
                transportMode
              ).toFixed(1)
            } 分`
            :
            "—";


          gviCarbon.innerText =
            getCarbonDisplay(
              currentGviDist
            );


          bounds.extend(
            coords
          );


          if (
            transportMode === 'walk'
          ) {

            spawnFootMarker(
              coords,
              ROUTE_COLORS.gvi
            );

          }

        }

        // 將剛建立的單色路線切換成目前使用者指定的著色方式。
        // 若選的是單色，外觀會與原本一致；若選 reNDVI / GVI，
        // 則使用 API 回傳的逐路段數值套用漸層。
        rebuildRouteLayers(routeColorMode);

        // ====================================================
        // 地圖縮放至所有路徑
        // ====================================================

        // 顯示路徑切換控制
        routeDisplayControl.style.display = 'block';

        // 每次規劃完成後，預設顯示「全部」
        setRouteDisplayButtonActive('all');
        setRouteDisplay('all');

        mobilePathOptions.forEach(
          function(btn) {

            btn.classList.toggle(
              'active',
              btn.dataset.mobileRoute === 'all'
            );

          }
        );

        // 推薦點會跟著使用者切換 reNDVI / GVI 路徑。
        updateGreenSpotMarkersForRouteMode(currentRouteDisplayMode);

        showStreetViewHint();

        // 顯示路徑圖例
        if (!routeLegendVisible) {
          routeLegend.addTo(map);
          routeLegendVisible = true;
        }

        // 地圖縮放至所有路徑範圍
        map.fitBounds(
          bounds,
          {
            padding: [50, 50]
          }
        );

        // 規劃完成後，右側成果預設顯示 reNDVI
        showNdviResult();

        // 更新健康步帳
        updateHealthStats();
      }
      catch(e) {
        console.error(e);
        alert(
          '路徑規劃失敗：' + (e.message || e)
        );
      }
    }
);

// ============================================================
// 路徑顯示切換
// ============================================================

function setRouteDisplay(mode) {

  currentRouteDisplayMode = mode;

  // 先全部關掉
  [
    ...shortestRouteLayers,
    ...ndviRouteLayers,
    ...gviRouteLayers
  ].forEach(layer => {

    if (
      layer &&
      map.hasLayer(layer)
    ) {
      map.removeLayer(layer);
    }

  });


  // 最短路徑永遠顯示
  shortestRouteLayers.forEach(layer => {

    if (
      layer &&
      !map.hasLayer(layer)
    ) {
      layer.addTo(map);
    }

  });


  // 全部
  if (mode === 'all') {

    ndviRouteLayers.forEach(layer => {

      if (
        layer &&
        !map.hasLayer(layer)
      ) {
        layer.addTo(map);
      }

    });

    gviRouteLayers.forEach(layer => {

      if (
        layer &&
        !map.hasLayer(layer)
      ) {
        layer.addTo(map);
      }

    });

  }


  // reNDVI
  else if (mode === 'ndvi') {

    ndviRouteLayers.forEach(layer => {

      if (
        layer &&
        !map.hasLayer(layer)
      ) {
        layer.addTo(map);
      }

    });

  }


  // GVI
  else if (mode === 'gvi') {

    gviRouteLayers.forEach(layer => {

      if (
        layer &&
        !map.hasLayer(layer)
      ) {
        layer.addTo(map);
      }

    });

  }

  // 路線切換時同步切換該路線自己的推薦點。
  updateGreenSpotMarkersForRouteMode(mode);

}

function setRouteDisplayButtonActive(mode) {

  routeDisplayButtons.forEach(btn => {

    btn.classList.toggle(
      'active',
      btn.dataset.routeDisplay === mode
    );

  });

}

const routeDisplayControl =
  document.getElementById('routeDisplayControl');

const routeDisplayButtons =
  document.querySelectorAll('.route-display-btn');


routeDisplayButtons.forEach(button => {

  button.addEventListener('click', () => {

    const mode =
      button.dataset.routeDisplay;

    setRouteDisplayButtonActive(mode);
    setRouteDisplay(mode);

  });

});


// ============================================================
// 規劃路線：單色 / reNDVI 漸層 / GVI 漸層
// ============================================================

function routeRendviColor(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '#bdbdbd';

  const low = Number.isFinite(currentRendviP05) ? currentRendviP05 : 0;
  const high = Number.isFinite(currentRendviP95) && currentRendviP95 > low
    ? currentRendviP95 : 1;

  return chroma.scale([
    '#F6F4A9', '#B8E186', '#66C2A4', '#2A9D8F', '#2C7FB8', '#253494'
  ]).domain([low, high]).mode('lab')(Math.max(low, Math.min(high, v))).hex();
}

function routeGviColor(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '#bdbdbd';

  const low = Number.isFinite(currentGviP05) ? currentGviP05 : 0;
  const high = Number.isFinite(currentGviP95) && currentGviP95 > low
    ? currentGviP95 : 100;

  return chroma.scale([
    '#F4E66A', '#D7E96B', '#A7D96B', '#69C66B', '#2FA66B', '#147A63'
  ]).domain([low, high]).mode('lab')(Math.max(low, Math.min(high, v))).hex();
}

function createRouteLayersByColor(feature, routeType, colorMode) {
  if (!feature || !feature.geometry || !feature.geometry.coordinates) {
    return [];
  }

  const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
  if (coords.length < 2) return [];

  const outlineColors = {
    shortest: '#7f1d1d',
    ndvi: '#14532d',
    gvi: '#064E3B'
  };

  const layers = [];

  layers.push(
    L.polyline(coords, {
      color: outlineColors[routeType] || '#475569',
      weight: 9,
      opacity: 0.68,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    })
  );

  if (colorMode === 'solid') {
    layers.push(
      L.polyline(coords, {
        color: ROUTE_COLORS[routeType] || '#64748b',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      })
    );
    return layers;
  }

  const segments = feature.properties?.segments || [];
  let validSegmentCount = 0;

  segments.forEach(segment => {
    const segmentCoords = (segment.coordinates || []).map(c => [c[1], c[0]]);
    if (segmentCoords.length < 2) return;

    const value = colorMode === 'rendvi'
      ? Number(segment.ndvi)
      : Number(segment.gvi_percent);

    if (!Number.isFinite(value)) return;

    const color = colorMode === 'rendvi'
      ? routeRendviColor(value)
      : routeGviColor(value);

    layers.push(
      L.polyline(segmentCoords, {
        color: color,
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      })
    );

    validSegmentCount += 1;
  });

  // 舊 API 尚未部署、或某條路線沒有逐路段資料時，自動退回單色，
  // 避免路線只剩外框。
  if (validSegmentCount === 0) {
    layers.push(
      L.polyline(coords, {
        color: ROUTE_COLORS[routeType] || '#64748b',
        weight: 5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false
      })
    );
  }

  return layers;
}

function rebuildRouteLayers(colorMode) {
  routeColorMode = colorMode;

  [
    ...shortestRouteLayers,
    ...ndviRouteLayers,
    ...gviRouteLayers
  ].forEach(layer => {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  });

  shortestRouteLayers = createRouteLayersByColor(
    lastRouteFeatures.shortest,
    'shortest',
    routeColorMode
  );

  ndviRouteLayers = createRouteLayersByColor(
    lastRouteFeatures.ndvi,
    'ndvi',
    routeColorMode
  );

  gviRouteLayers = createRouteLayersByColor(
    lastRouteFeatures.gvi,
    'gvi',
    routeColorMode
  );

  pathLayers.push(
    ...shortestRouteLayers,
    ...ndviRouteLayers,
    ...gviRouteLayers
  );

  setRouteDisplay(currentRouteDisplayMode);
  updateRouteColorButtons(colorMode);
  updateRouteColorLegend(colorMode);
}

function updateRouteColorButtons(mode) {
  document.querySelectorAll('.route-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.routeColor === mode);
  });

  document.querySelectorAll('.mobile-color-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mobileColor === mode);
  });
}

document.querySelectorAll('.route-color-btn').forEach(button => {
  button.addEventListener('click', function() {
    rebuildRouteLayers(this.dataset.routeColor);
  });
});

document.querySelectorAll('.mobile-color-option').forEach(button => {
  button.addEventListener('click', function() {
    rebuildRouteLayers(this.dataset.mobileColor);
  });
});

// 建立一個浮動小知識視窗
const stepsInfoBtn = document.getElementById('stepsInfoBtn');

// 1. 修正小視窗的定位方式
const infoPopup = document.createElement('div');
infoPopup.style.position = 'fixed';       // 🟢 改成 fixed，讓它跟隨螢幕視窗，不跟隨網頁捲軸
infoPopup.style.top = '72px';             // 桌機稍微往上移，避免底部關閉鈕被裁切
infoPopup.style.right = '16px';           // 🟢 貼近手機右側邊緣
infoPopup.style.width = '360px';
infoPopup.style.maxWidth = 'calc(100vw - 28px)';
infoPopup.style.maxHeight = 'calc(100vh - 92px)';
infoPopup.style.overflowY = 'auto';
infoPopup.style.background = '#ffffff';
infoPopup.style.border = '1px solid #cbd5e1';
infoPopup.style.borderRadius = '10px';
infoPopup.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)'; // 讓陰影深一點，在手機上層次更明顯
infoPopup.style.padding = '14px';
infoPopup.style.fontSize = '14px';        // 手機版字體稍微放大一點點比較好讀
infoPopup.style.color = '#111827';
infoPopup.style.display = 'none';
infoPopup.style.zIndex = '9999';          // 🟢 把層級調到極高，確保絕對不會被地圖或面板擋住

// 2. 優化後的 HTML 內容與精緻排版
infoPopup.innerHTML = `
  <div style="font-weight:800; font-size:15px; margin-bottom:10px; color:#675853; border-bottom:2px solid #DFE200; padding-bottom:5px;">
    健康步帳說明 💡
  </div>

  <div style="line-height:1.65; display:flex; flex-direction:column; gap:10px;">
    <div>
      <div style="font-weight:800; color:#3f7f55; margin-bottom:3px;">👣 步數與步幅估算</div>
      <div style="padding-left:4px; font-size:13px; color:#4b5563;">
        • 平均步距 ≈ 身高 (m) × 0.43<br>
        • 預估步數 ≈ 距離 (km) × 1000 ÷ 步距
      </div>
    </div>

    <div>
      <div style="font-weight:800; color:#b45309; margin-bottom:3px;">🔥 能量消耗與壽命效益</div>
      <div style="padding-left:4px; font-size:13px; color:#4b5563;">
        • 熱量消耗 ≈ 每 1,000 步燃燒 40 大卡<br>
        • 系統換算公式：步數 × 0.004 分鐘
      </div>
    </div>

    <div>
      <div style="font-weight:800; color:#675853; margin-bottom:3px;">📚 壽命效益換算依據</div>
      <div style="font-size:12.5px; color:#4b5563;">
        <strong>Harvard Health Publishing：</strong>每運動 1 小時，約增加 2 小時（120 分鐘）預期壽命。<br><br>
        <strong>體育署／Wen et al. (2011, The Lancet)：</strong>每日約 15 分鐘運動與總死亡率降低 14% 及平均壽命增加 3 年相關。<br><br>
        <strong>Tudor-Locke et al. (2012)：</strong>NHANES 成年人平均最高 30 分鐘步頻為 71.1 步／分鐘。
      </div>
    </div>

    <div style="padding:8px 10px; background:#f7f6f3; border-radius:8px; font-size:12.5px; color:#4b5563; line-height:1.65;">
      120 × 14% ＝ 16.8 分鐘／小時<br>
      71.1 × 60 ＝ 4,266 步／小時<br>
      16.8 ÷ 4,266 ＝ 0.003938 分鐘／步<br>
      <strong>四捨五入後採 0.004 分鐘／步</strong>
    </div>

    <div style="font-size:11.5px; color:#7c6f6a; line-height:1.55;">
      此數值為研究資料推估的群體平均效益，僅供健康資訊呈現，並非個人壽命預測。
    </div>
  </div>

  <div style="text-align:right; margin-top:12px; border-top:1px solid #f1f5f9; padding-top:7px;">
    <button id="closeInfoPopup" style="background:#f1f5f9; border:none; color:#6b7280; font-weight:700; cursor:pointer; padding:5px 11px; border-radius:6px; font-size:12px;">關閉 ✖</button>
  </div>
`;
document.body.appendChild(infoPopup);

// 3. 補齊點擊顯示與關閉的監聽器
function positionHealthInfoPopup() {
  if (window.innerWidth <= 1024) {
    infoPopup.style.top = 'max(12px, env(safe-area-inset-top))';
    infoPopup.style.left = '12px';
    infoPopup.style.right = '12px';
    infoPopup.style.width = 'auto';
    infoPopup.style.maxWidth = 'none';
    infoPopup.style.maxHeight = 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))';
  } else {
    infoPopup.style.top = '72px';
    infoPopup.style.left = 'auto';
    infoPopup.style.right = '16px';
    infoPopup.style.width = '360px';
    infoPopup.style.maxWidth = 'calc(100vw - 28px)';
    infoPopup.style.maxHeight = 'calc(100vh - 92px)';
  }
}

stepsInfoBtn.addEventListener('click', ()=>{
  positionHealthInfoPopup();
  infoPopup.style.display = 'block';
});

document.getElementById('closeInfoPopup').addEventListener('click', ()=>{
  infoPopup.style.display = 'none';
});

// ============================================================
// reNDVI / GVI 說明視窗
// ============================================================

const rendviInfoBtn = document.getElementById('rendviInfoBtn');
const gviInfoBtn = document.getElementById('gviInfoBtn');


// 共用說明視窗
const greenInfoPopup = document.createElement('div');

greenInfoPopup.style.position = 'fixed';
greenInfoPopup.style.top = '72px';
greenInfoPopup.style.right = '16px';
greenInfoPopup.style.width = '430px';
greenInfoPopup.style.maxWidth = 'calc(100vw - 32px)';
greenInfoPopup.style.maxHeight = 'calc(100vh - 92px)';
greenInfoPopup.style.overflowY = 'auto';
greenInfoPopup.style.boxSizing = 'border-box';
greenInfoPopup.style.background = '#ffffff';
greenInfoPopup.style.border = '1px solid #cbd5e1';
greenInfoPopup.style.borderRadius = '10px';
greenInfoPopup.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
greenInfoPopup.style.padding = '14px';
greenInfoPopup.style.fontSize = '13px';
greenInfoPopup.style.color = '#111827';
greenInfoPopup.style.display = 'none';
greenInfoPopup.style.zIndex = '9999';
greenInfoPopup.style.lineHeight = '1.7';

document.body.appendChild(greenInfoPopup);

// 依螢幕大小調整說明視窗位置，避免手機 Safari 上下被切掉
function positionGreenInfoPopup() {
  if (window.innerWidth <= 1024) {
    greenInfoPopup.style.top = 'max(12px, env(safe-area-inset-top))';
    greenInfoPopup.style.left = '12px';
    greenInfoPopup.style.right = '12px';
    greenInfoPopup.style.width = 'auto';
    greenInfoPopup.style.maxWidth = 'none';
    greenInfoPopup.style.maxHeight = 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))';
    greenInfoPopup.style.padding = '13px';
  } else {
    greenInfoPopup.style.top = '72px';
    greenInfoPopup.style.left = 'auto';
    greenInfoPopup.style.right = '16px';
    greenInfoPopup.style.width = '430px';
    greenInfoPopup.style.maxWidth = 'calc(100vw - 32px)';
    greenInfoPopup.style.maxHeight = 'calc(100vh - 92px)';
    greenInfoPopup.style.padding = '14px';
  }
}

// ============================================================
// 負碳存摺說明
// ============================================================
const carbonInfoBtn = document.getElementById('carbonInfoBtn');

if (carbonInfoBtn) {
  carbonInfoBtn.addEventListener('click', () => {
    greenInfoPopup.innerHTML = `
      <div style="
        font-weight:800;
        font-size:15px;
        margin-bottom:12px;
        color:#675853;
        border-bottom:2px solid #DFE200;
        padding-bottom:5px;
      ">
        負碳存摺說明 💡
      </div>

      <div style="font-weight:800;color:#675853;margin-bottom:4px;">
        目前換算方式
      </div>

      <div style="
        background:#F8F7F5;
        border:1px solid #E6E0DC;
        border-radius:8px;
        padding:9px 10px;
        margin-bottom:11px;
        color:#4b5563;
        font-weight:700;
        text-align:center;
      ">
        路徑距離（km）× 50.8 g CO₂/km
      </div>

      <div style="color:#4b5563;line-height:1.75;margin-bottom:10px;">
        步行與自行車以零直接排放估算；畫面上的負值代表相較騎機車所避免的排放，並非吸收或移除大氣中的二氧化碳。
      </div>

      <div style="color:#4b5563;line-height:1.75;margin-bottom:10px;">
        50.8 g CO₂/km 為系統既有暫定係數。由於原始版本、車種與速度條件尚未完整註記，目前僅適合路徑間的概略比較，不宜作為正式碳盤查結果。
      </div>

      <div style="
        padding:9px 10px;
        border-radius:8px;
        background:#FFFBE8;
        border:1px solid #EEE2A4;
        color:#5f5a58;
        line-height:1.6;
      ">
        <strong>參考資料：</strong><br>
        <a
          href="https://data.gov.tw/dataset/33215"
          target="_blank"
          rel="noopener noreferrer"
          style="color:#166534;font-weight:800;text-decoration:underline;"
        >交通部運輸研究所－機車動態能耗與碳排放係數</a>
      </div>

      <div style="text-align:right;margin-top:12px;border-top:1px solid #f1f5f9;padding-top:6px;">
        <button
          id="closeGreenInfoPopup"
          style="background:#f1f5f9;border:none;color:#6b7280;font-weight:700;cursor:pointer;padding:4px 10px;border-radius:6px;font-size:12px;"
        >關閉 ✖</button>
      </div>
    `;

    positionGreenInfoPopup();
    greenInfoPopup.style.display = 'block';

    const closeBtn = document.getElementById('closeGreenInfoPopup');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        greenInfoPopup.style.display = 'none';
      });
    }
  });
}

// ============================================================
// reNDVI 說明
// ============================================================

rendviInfoBtn.addEventListener('click', () => {

  greenInfoPopup.innerHTML = `
    <div style="
      font-weight:800;
      font-size:15px;
      margin-bottom:12px;
      color:#166534;
      border-bottom:2px solid #22c55e;
      padding-bottom:5px;
    ">
      綠暴露（reNDVI）說明 💡
    </div>


    <!-- 指標意義 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      指標意義
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:12px;
    ">
      綠暴露（reNDVI）利用
      <strong>福衛八號（齊柏林衛星）</strong>
      的紅邊與近紅外波段，估算沿途接觸植生環境的程度；
      數值越高，通常代表周圍植生越茂密。
    </div>


    <!-- 路徑選擇 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      路徑選擇
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:12px;
    ">
      系統將道路切成約 20 公尺路段，使用路段周圍的最高綠暴露路徑。
      道路越綠、距離越短，越容易被選入高綠暴露路徑。
    </div>


    <!-- 提升率計算 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      提升率計算
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:8px;
    ">
      先依路段長度計算整條路徑的平均 reNDVI，
      再與最短路徑比較，換算為提升百分比。
    </div>


    <!-- 提升率公式 -->
    <div style="
      background:#f0fdf4;
      border:1px solid #bbf7d0;
      border-radius:8px;
      padding:10px 12px;
      margin:8px 0 14px 0;
      color:#166534;
      font-weight:700;
      line-height:1.6;
      text-align:center;
    ">
      提升率（%）＝
      <span style="white-space:nowrap;">
        （高綠暴露路徑平均值 − 最短路徑平均值）
      </span>
      ÷
      <span style="white-space:nowrap;">
        最短路徑平均值
      </span>
      × 100
    </div>


    <!-- 資料提醒 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      資料提醒
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
    ">
      地下道與覆蓋道路不採用道路上方地表的衛星綠度，
      避免高估實際綠暴露。
    </div>


    <!-- 關閉按鈕 -->
    <div style="
      text-align:right;
      margin-top:12px;
      border-top:1px solid #f1f5f9;
      padding-top:6px;
    ">
      <button
        id="closeGreenInfoPopup"
        style="
          background:#f1f5f9;
          border:none;
          color:#6b7280;
          font-weight:700;
          cursor:pointer;
          padding:4px 10px;
          border-radius:6px;
          font-size:12px;
        ">
        關閉 ✖
      </button>
    </div>
  `;

  positionGreenInfoPopup();
  greenInfoPopup.style.display = 'block';

  document
    .getElementById('closeGreenInfoPopup')
    .addEventListener('click', () => {
      greenInfoPopup.style.display = 'none';
    });

});


// ============================================================
// GVI 說明
// ============================================================

gviInfoBtn.addEventListener('click', () => {

  greenInfoPopup.innerHTML = `
    <div style="
      font-weight:800;
      font-size:15px;
      margin-bottom:12px;
      color:#166534;
      border-bottom:2px solid #22c55e;
      padding-bottom:5px;
    ">
      綠視率（GVI）說明 💡
    </div>


    <!-- 指標意義 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      指標意義
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:12px;
    ">
      綠視率（GVI）表示從街道上的行人視角可看到的綠色植生比例；
      數值越高，通常代表視野中的樹木與植生越多。
    </div>


    <!-- 路徑選擇 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      路徑選擇
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:12px;
    ">
      系統將 GVI 點位配對至道路路段。
      同一點位有多個拍攝方向時先取平均；
      同一路段有多個點位時再取平均。
      道路的可見綠意越多、距離越短，
      越容易被選入高綠視率路徑。
    </div>


    <!-- 提升率計算 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      提升率計算
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
      margin-bottom:8px;
    ">
      先依路段長度計算整條路徑的平均 GVI，
      再與最短路徑比較，換算為提升百分比。
    </div>


    <!-- 提升率公式 -->
    <div style="
      background:#f0fdf4;
      border:1px solid #bbf7d0;
      border-radius:8px;
      padding:10px 12px;
      margin:8px 0 14px 0;
      color:#166534;
      font-weight:700;
      line-height:1.6;
      text-align:center;
    ">
      提升率（%）＝
      <span style="white-space:nowrap;">
        （高綠視率路徑平均值 − 最短路徑平均值）
      </span>
      ÷
      <span style="white-space:nowrap;">
        最短路徑平均值
      </span>
      × 100
    </div>


    <!-- 資料提醒 -->
    <div style="
      font-weight:800;
      color:#166534;
      margin-bottom:4px;
    ">
      資料提醒
    </div>

    <div style="
      color:#4b5563;
      line-height:1.7;
    ">
      若任一路徑的 GVI 資料覆蓋率未達 60%，
      系統仍會計算，並在結果下方提醒僅供參考。
    </div>


    <!-- 關閉按鈕 -->
    <div style="
      text-align:right;
      margin-top:12px;
      border-top:1px solid #f1f5f9;
      padding-top:6px;
    ">
      <button
        id="closeGreenInfoPopup"
        style="
          background:#f1f5f9;
          border:none;
          color:#6b7280;
          font-weight:700;
          cursor:pointer;
          padding:4px 10px;
          border-radius:6px;
          font-size:12px;
        ">
        關閉 ✖
      </button>
    </div>
  `;

  positionGreenInfoPopup();
  greenInfoPopup.style.display = 'block';

  document
    .getElementById('closeGreenInfoPopup')
    .addEventListener('click', () => {
      greenInfoPopup.style.display = 'none';
    });

});

// ============================================================
// Google Street View
// ============================================================

let streetViewPanorama = null;



// ============================================================
// Street View 位置 Marker
// ============================================================

function createStreetViewMarker() {

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:32px;
        height:32px;
        border-radius:50%;
        background:#ffffff;
        border:3px solid #15803d;
        box-shadow:0 3px 10px rgba(0,0,0,0.25);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:16px;
      ">
        📷
      </div>
    `,
    iconSize:[38,38],
    iconAnchor:[19,19]
  });

}

// ============================================================
// 手機版：控制面板 / 資訊面板切換
// ============================================================

// ============================================================
// 手機版：控制面板 / 資訊面板 / 路徑顯示
// ============================================================

const mobileInfoBtn =
  document.getElementById('mobileInfoBtn');

const mobileControlBtn =
  document.getElementById('mobileControlBtn');

const mobileRouteBtn =
  document.getElementById('mobileRouteBtn');

const mobileResetBtn =
  document.getElementById('mobileResetBtn');

const mobilePathDisplayBtn =
  document.getElementById('mobilePathDisplayBtn');

const mobilePathPopup =
  document.getElementById('mobilePathPopup');

const mobilePathOptions =
  document.querySelectorAll('.mobile-path-option');

const closeMobilePathPopup =
  document.getElementById('closeMobilePathPopup');

// ============================================================
// 手機版：開啟 / 關閉路徑顯示選單
// ============================================================

mobilePathDisplayBtn.addEventListener(
  'click',
  function(e) {

    e.stopPropagation();

    mobilePathPopup.classList.toggle('show');

  }
);


// ============================================================
// 手機版：選擇要顯示的路徑
// ============================================================

mobilePathOptions.forEach(
  function(btn) {

    btn.addEventListener(
      'click',
      function(e) {

        e.stopPropagation();

        const mode =
          btn.dataset.mobileRoute;

        // 切換地圖上的路徑
        setRouteDisplay(mode);

        // 同步桌機左側按鈕狀態
        setRouteDisplayButtonActive(mode);

        // 手機選單 active 狀態
        mobilePathOptions.forEach(
          function(b) {

            b.classList.remove('active');

          }
        );

        btn.classList.add('active');

      }
    );

  }
);

// ============================================================
// 手機版：關閉路徑顯示視窗
// ============================================================

closeMobilePathPopup.addEventListener(
  'click',
  function(e) {

    e.preventDefault();
    e.stopPropagation();

    mobilePathPopup.classList.remove('show');

  }
);

mobileRouteBtn.addEventListener('click', () => {
  // 若設定面板正開啟，先收起，讓地圖立刻恢復可見
  closeMobilePanels();

  // 直接沿用原有的雙路徑規劃功能
  document.getElementById('dualPathBtn').click();
});

const controlPanel =
  document.querySelector('.panel-controls');

const statsPanel =
  document.querySelector('.panel-stats');

function closeMobilePanels() {

  controlPanel.classList.remove(
    'mobile-panel-open'
  );

  statsPanel.classList.remove(
    'mobile-panel-open'
  );

}

// ============================================================
// 手機版：重置
// ============================================================

mobileResetBtn.addEventListener('click', () => {

  // 先關閉手機面板
  closeMobilePanels();

  // 沿用原本桌機版的重置功能
  document
    .getElementById('resetBtn')
    .click();

});

document.getElementById('closeControlPanel').addEventListener(
  'click',
  closeMobilePanels
);

document.getElementById('closeStatsPanel').addEventListener(
  'click',
  closeMobilePanels
);

function isMobileView() {
  return window.matchMedia("(max-width: 1024px)").matches;
}

function toggleMobilePanel(panel) {
  // 電腦版不使用抽屜切換
  if (window.innerWidth > 1024) return;

  const isOpen = panel.classList.contains('mobile-panel-open');

  // 每次只允許一個面板開啟
  controlPanel.classList.remove('mobile-panel-open');
  statsPanel.classList.remove('mobile-panel-open');

  // 再點一次同一個按鈕，就收起面板
  if (!isOpen) {
    panel.classList.add('mobile-panel-open');
  }
}

function showMobileInfo() {
  toggleMobilePanel(statsPanel);
}

function showMobileControl() {
  toggleMobilePanel(controlPanel);
}

mobileInfoBtn.addEventListener('click', showMobileInfo);
mobileControlBtn.addEventListener('click', showMobileControl);
window.addEventListener('resize', () => {
  if (window.innerWidth > 1024) {
    controlPanel.classList.remove('mobile-panel-open');
    statsPanel.classList.remove('mobile-panel-open');
  }
});


// ============================================================
// 顯示指定位置附近的 Google Street View
// ============================================================

function showStreetView(lat, lng, showMapMarker = streetViewMarkerEnabled) {

  // 推薦景點傳 false；只有拖曳小黃人才傳 true。
  streetViewMarkerEnabled = Boolean(showMapMarker);

  if (!streetViewMarkerEnabled && streetViewMarker && map.hasLayer(streetViewMarker)) {
    map.removeLayer(streetViewMarker);
    streetViewMarker = null;
  }

  console.log("正在取得道路街景...");
  console.log("位置:", lat, lng);

  // ----------------------------------------------------------
  // 檢查 Google Maps API
  // ----------------------------------------------------------

  if (!window.google || !google.maps) {

    console.error(
      "Google Maps JavaScript API 尚未載入"
    );

    alert(
      "Google 街景服務尚未載入完成，請稍後再試。"
    );

    return;
  }


  const container =  document.getElementById(    'streetViewModalMap'  );


  // ----------------------------------------------------------
  // 第一次建立 Street View
  // ----------------------------------------------------------

  if (!streetViewPanorama) {

    container.innerHTML = `
      <div id="streetView" style="
        width:100%;
        height:100%;
      "></div>
    `;


    streetViewPanorama =
      new google.maps.StreetViewPanorama(
        document.getElementById('streetView'),
        {

          position: {
            lat: lat,
            lng: lng
          },

          pov: {
            heading: 0,
            pitch: 0
          },

          zoom: 1,

          addressControl: false,
          linksControl: true,
          panControl: false,
          zoomControl: true,
          fullscreenControl: true,

          motionTracking: false,
          motionTrackingControl: false,

          showRoadLabels: true

        }
      );


    // ========================================================
    // Street View 移動時，同步更新 Leaflet Marker
    // ========================================================

    streetViewPanorama.addListener(
      'position_changed',
      () => {

        const position =
          streetViewPanorama.getPosition();

        if (!position) return;


        const newLat = position.lat();
        const newLng = position.lng();


        console.log(
          "Street View 目前位置:",
          newLat,
          newLng
        );


        // 只有小黃人模式才同步顯示地圖上的相機 Marker
        if (!streetViewMarkerEnabled) {
          return;
        }

        if (!streetViewMarker) {

          streetViewMarker = L.marker(
            [newLat, newLng],
            {
              icon: createStreetViewMarker(),
              interactive: false,
              zIndexOffset: 1000
            }
          ).addTo(map);

        } else {

          streetViewMarker.setLatLng(
            [newLat, newLng]
          );

        }

      }
    );


  } else {

    // --------------------------------------------------------
    // Street View 已經存在 → 移動到新的位置
    // --------------------------------------------------------

    streetViewPanorama.setPosition({
      lat: lat,
      lng: lng
    });

  }


  // ----------------------------------------------------------
  // 只有拖曳小黃人時，才在地圖顯示 Street View 相機 Marker
  // ----------------------------------------------------------

  if (!streetViewMarkerEnabled) {
    return;
  }

  const streetLatLng =
    L.latLng(lat, lng);


  if (!streetViewMarker) {

    streetViewMarker =
      L.marker(
        streetLatLng,
        {
          icon: createStreetViewMarker(),
          interactive: false,
          zIndexOffset: 1000
        }
      ).addTo(map);

  } else {

    streetViewMarker.setLatLng(
      streetLatLng
    );

  }

}

// ============================================================
// 歡迎畫面：開始使用
// ============================================================

const welcomeOverlay = document.getElementById('welcomeOverlay');
const startUsingBtn = document.getElementById('startUsingBtn');

if (startUsingBtn) {
  startUsingBtn.addEventListener('click', () => {

    // 與按鈕上的保險入口共用同一套關閉邏輯。
    enterMainSite();

    setTimeout(() => {
      // 下列功能若其中一項尚未初始化，不影響使用者進入主畫面。
      try {
        if (typeof showNdviResult === 'function') showNdviResult();
      } catch (e) {
        console.warn('初始化成果面板失敗：', e);
      }

      try {
        if (typeof updateHealthStats === 'function') updateHealthStats();
      } catch (e) {
        console.warn('初始化健康資訊失敗：', e);
      }
    }, 450);

  });
}



/* ===== 原 index.html inline script 9 ===== */

/* ============================================================
   v10：LINE / iOS WebView 地址輸入時避免 viewport 自動放大
   ============================================================ */
(function () {
  const addrInput = document.getElementById('addrInput');
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (!addrInput || !viewportMeta) return;

  const normalViewport =
    'width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover';
  const focusViewport =
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

  const ua = navigator.userAgent || '';
  const isLine = /Line\//i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = window.matchMedia('(max-width: 1024px)').matches;

  function lockInputViewport() {
    if (!isMobile) return;
    /* LINE WebView 最容易發生 focus zoom；iOS WebView 也一併保護。 */
    if (isLine || isIOS) {
      viewportMeta.setAttribute('content', focusViewport);
    }
  }

  function restoreInputViewport() {
    if (!isMobile) return;
    window.setTimeout(function () {
      viewportMeta.setAttribute('content', normalViewport);
      /* viewport 還原後通知 Leaflet 重新計算尺寸，避免地圖偏移。 */
      if (typeof map !== 'undefined' && map && typeof map.invalidateSize === 'function') {
        map.invalidateSize({ pan: false });
      }
    }, 120);
  }

  /* pointer/touch 階段先鎖 viewport，早於 focus，可降低 LINE WebView 自動 zoom。 */
  addrInput.addEventListener('touchstart', lockInputViewport, { passive: true });
  addrInput.addEventListener('pointerdown', lockInputViewport, { passive: true });
  addrInput.addEventListener('focus', lockInputViewport);
  addrInput.addEventListener('blur', restoreInputViewport);

  /* 頁面離開輸入狀態時保證恢復正常手動縮放。 */
  window.addEventListener('pagehide', function () {
    viewportMeta.setAttribute('content', normalViewport);
  });
})();


/* ===== 原 index.html inline script 10 ===== */


/* ============================================================
   嘉義市自行車道（參考）
   - 原始資料：data/202606_SOUTH.geojson
   - 只取 CITY = 嘉義市
   - 再用嘉義市行政區界精確裁切，市界外不顯示
   ============================================================ */
let chiayiBicycleLayer = L.geoJSON(null, {
  style: () => ({
    color: '#1687C9',
    weight: 4.2,
    opacity: 0.92,
    lineCap: 'round',
    lineJoin: 'round'
  }),
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const name = p.NAME || p.ROAD_ALIAS || '自行車道';
    const details = [
      p.TOWN,
      p.B_LENGTH ? `${Math.round(Number(p.B_LENGTH))} m` : '',
      (p.SP_DESC && p.EP_DESC)
        ? `${p.SP_DESC} → ${p.EP_DESC}`
        : (p.SP_DESC || p.EP_DESC || '')
    ].filter(Boolean).join('<br>');

    layer.bindPopup(
      `<div class="chiayi-bike-popup"><b>🚲 ${name}</b>${details ? '<br>' + details : ''}</div>`
    );
  }
});

overlayMaps["自行車道（參考）"] = chiayiBicycleLayer;
layerControl.addOverlay(chiayiBicycleLayer, "自行車道（參考）");

let chiayiBikeLoadState='讀取中';
let chiayiBikeSourceCount = 0;
let chiayiBikeVisibleSegmentCount = 0;

function polygonParts(feature) {
  if (!feature?.geometry) return [];
  if (feature.geometry.type === 'Polygon') return [feature];
  if (feature.geometry.type === 'MultiPolygon') {
    return feature.geometry.coordinates.map(coords =>
      turf.polygon(coords, feature.properties || {})
    );
  }
  return [];
}

function lineParts(feature) {
  if (!feature?.geometry) return [];
  if (feature.geometry.type === 'LineString') return [feature];
  if (feature.geometry.type === 'MultiLineString') {
    return feature.geometry.coordinates.map(coords =>
      turf.lineString(coords, feature.properties || {})
    );
  }
  return [];
}

/* 將一條線依 polygon 邊界切開，再只保留中點位於 polygon 內的片段。 */
function clipLineToPolygon(line, polygon) {
  try {
    const border = turf.polygonToLine(polygon);
    const borderLines = border.type === 'FeatureCollection'
      ? border.features
      : [border];

    let pieces = [line];

    borderLines.forEach(borderLine => {
      const nextPieces = [];
      pieces.forEach(piece => {
        try {
          const split = turf.lineSplit(piece, borderLine);
          if (split?.features?.length) nextPieces.push(...split.features);
          else nextPieces.push(piece);
        } catch (_) {
          nextPieces.push(piece);
        }
      });
      pieces = nextPieces;
    });

    return pieces.filter(piece => {
      try {
        const len = turf.length(piece, {units:'kilometers'});
        const mid = turf.along(piece, len / 2, {units:'kilometers'});
        return turf.booleanPointInPolygon(mid, polygon, {ignoreBoundary:false});
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return [];
  }
}

async function loadChiayiBicycleLayer() {
  try {
    const [bikeRes, boundaryRes] = await Promise.all([
      fetch('data/202606_SOUTH.geojson'),
      fetch(CHIAYI_BOUNDARY_URL)
    ]);

    if (!bikeRes.ok) throw new Error(`自行車道資料 HTTP ${bikeRes.status}`);
    if (!boundaryRes.ok) throw new Error(`嘉義市界資料 HTTP ${boundaryRes.status}`);

    const bikeData = await bikeRes.json();
    const boundaryData = await boundaryRes.json();

    const chiayiFeatures = (bikeData.features || []).filter(
      f => (f.properties || {}).CITY === '嘉義市'
    );
    chiayiBikeSourceCount = chiayiFeatures.length;

    const polygons = [];
    (boundaryData.features || []).forEach(f => polygons.push(...polygonParts(f)));

    const clipped = [];

    chiayiFeatures.forEach(feature => {
      const lines = lineParts(feature);

      lines.forEach(line => {
        polygons.forEach(poly => {
          const pieces = clipLineToPolygon(line, poly);
          pieces.forEach(piece => {
            piece.properties = {...(feature.properties || {})};
            clipped.push(piece);
          });
        });
      });
    });

    chiayiBikeVisibleSegmentCount = clipped.length;

    chiayiBicycleLayer.clearLayers();
    chiayiBicycleLayer.addData({
      type: 'FeatureCollection',
      features: clipped
    });

    chiayiBikeLoadState='已載入';
    if(document.getElementById('bikeInfoCount'))document.getElementById('bikeInfoCount').textContent=chiayiBikeSourceCount;
    console.log(
      `嘉義市自行車道：原始 ${chiayiBikeSourceCount} 筆，裁切後 ${chiayiBikeVisibleSegmentCount} 個市界內線段`
    );
  } catch (error) {
    chiayiBikeLoadState='載入失敗，請重新整理後再試';
    if(document.getElementById('bikeInfoCount'))document.getElementById('bikeInfoCount').textContent=chiayiBikeLoadState;
    console.error('嘉義市自行車道載入／裁切失敗：', error);
  }
}

loadChiayiBicycleLayer();

/* ------------------------------------------------------------
   自行車道說明卡
   ------------------------------------------------------------ */
const bikeInfoControl = L.control({position:'bottomleft'});

bikeInfoControl.onAdd = function() {
  const div = L.DomUtil.create('div', 'bike-info-card');
  div.innerHTML = `
    <div class="bike-info-head">
      <div>
        <div class="bike-info-title">自行車道（參考）</div>
        <div class="bike-info-subtitle">官方登載自行車道</div>
      </div>
      <button class="bike-info-close" type="button" aria-label="關閉">×</button>
    </div>
    <div class="bike-info-body">
      <div>顯示範圍：<b>嘉義市市界內</b></div>
      <div>已載入 <b id="bikeInfoCount">—</b> 筆原始路段</div>
      <details>
        <summary>ⓘ 資訊來源與限制</summary>
        <div class="bike-info-detail">
          內政部國土管理署／
          <a href="https://data.gov.tw/dataset/90135" target="_blank" rel="noopener">政府資料開放平臺「自行車道」</a>。
          本系統使用 115 年上半年度資料（202606），授權方式為政府資料開放授權條款第 1 版。
          <br><br>
          僅供地圖參考，不影響目前路徑解算，也不代表路線連通、即時開放或已驗證安全。
          方向與現況請依現場標誌確認。顯示線段已依嘉義市行政區界裁切。
        </div>
      </details>
    </div>`;
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);
  div.querySelector('.bike-info-close').addEventListener('click', () => {
    map.removeControl(bikeInfoControl);
  });
  return div;
};

function showBikeInfo() {
  if (!document.querySelector('.bike-info-card')) bikeInfoControl.addTo(map);
  const count = document.getElementById('bikeInfoCount');
  if (count) count.textContent = chiayiBikeLoadState==='已載入'?chiayiBikeSourceCount:chiayiBikeLoadState;
}

function hideBikeInfo() {
  if (document.querySelector('.bike-info-card')) {
    try { map.removeControl(bikeInfoControl); } catch (_) {}
  }
}

map.on('overlayadd', e => {
  if (e.layer === chiayiBicycleLayer) showBikeInfo();
});
map.on('overlayremove', e => {
  if (e.layer === chiayiBicycleLayer) hideBikeInfo();
});

setTimeout(function(){
  try{
    if(typeof organizeLayerControl === 'function') organizeLayerControl();
  }catch(e){
    console.warn('圖層控制整理略過：', e);
  }
}, 0);




/* ===== 原 index.html inline script 11 ===== */

(() => {
'use strict';
const API_BASE='https://healthy-route-api-995293427533.asia-east1.run.app';
const byId=id=>document.getElementById(id);
function addDetour(){
  const btn=byId('dualPathBtn');
  if(!btn||byId('extraMinutes'))return;
  const box=document.createElement('div');
  box.className='detour-integrated';
  box.innerHTML=`
    <div class="detour-title-row">
      <label for="extraMinutes"><b>🚶 願意多走多久，換取更多綠意？</b></label>
    </div>
    <button id="detourInfoBtn" class="detour-info-btn" type="button" aria-label="展開或收合說明" aria-controls="detourInfoPopover" aria-expanded="false">ⓘ</button>
    <div id="detourInfoPopover" class="detour-info-popover" hidden>
      設定比「省時短程路徑」最多願意多走幾分鐘，尋找更綠的步行路線。這是預估上限，不一定會多走這麼久。調整後請再按「路徑解算」。
    </div>
    <select id="extraMinutes">
      <option value="">預設（距離增加最多 20%）</option>
      <option value="3">最多多走 3 分鐘</option>
      <option value="5">最多多走 5 分鐘</option>
      <option value="10">最多多走 10 分鐘</option>
    </select>`;
  btn.parentElement.insertBefore(box,btn);
  const infoBtn=byId('detourInfoBtn'),pop=byId('detourInfoPopover');
  infoBtn.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    const open=pop.hidden;pop.hidden=!open;
    infoBtn.setAttribute('aria-expanded',String(open));
  });

}
function patchFetch(){const old=window.fetch;window.fetch=function(input,init){try{let u=typeof input==='string'?input:input.url;if(u.includes('/route?')&&byId('extraMinutes')?.value&&byId('modeSelect')?.value==='walk'){const url=new URL(u);url.searchParams.set('extra_minutes',byId('extraMinutes').value);input=typeof input==='string'?url.toString():new Request(url,input);}}catch(_){}return old.call(this,input,init);};}
window.addEventListener('DOMContentLoaded',()=>{addDetour();patchFetch();});
})();



/* ===== 原 index.html inline script 12 ===== */

(()=>{'use strict';

const API='https://healthy-route-api-995293427533.asia-east1.run.app';
const $=id=>document.getElementById(id);

let toolsEpoch=0;
let poiLayer=null,loopLayer=null,navLayer=null,watch=null,userMarker=null;
let navCoords=[],maneuvers=[],spoken=new Set(),selectedNear='start';
let navView=null,accuracyLayer=null,navLastFix=0,navTimer=null,navVoiceEnabled=true,navTotal=0,navMaxProgress=0,arrivalFixes=0,navActive=false;
window.addEventListener('chiayi-route-planning',()=>{if(navActive)stopNav();});
document.getElementById('resetBtn').addEventListener('click',()=>{if(navActive)stopNav();});

function ensurePoiLayer(){
  if(!poiLayer) poiLayer=L.layerGroup().addTo(map);
  return poiLayer;
}
function getMapWrap(){return document.querySelector('.map-wrap')||document.getElementById('map')?.parentElement}
function getActiveMapHost(){return document.fullscreenElement||getMapWrap()}

function removeOldTools(){
  document.querySelector('.integrated-tools')?.remove();
  document.querySelector('.feature-drawer')?.remove();
  document.getElementById('v2Tools')?.remove();
  document.getElementById('v2Sub')?.remove();
}

function mount(){
  removeOldTools();
  if(document.getElementById('v2MapTools')||!window.map)return;

  ensurePoiLayer();

  const box=document.createElement('div');
  box.id='v2MapTools';
  box.className='v2-map-tools';
  box.innerHTML=`
    <button id="v2MoreBtn" class="v2-more-btn" type="button" title="附加功能" aria-label="附加功能" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <section id="v2MapDrawer" class="v2-map-drawer" hidden>
      <header class="v2-drawer-head">
        <div><small>附加功能</small><strong id="v2DrawerTitle">探索與工具</strong></div>
        <button id="v2DrawerClose" type="button" aria-label="關閉">×</button>
      </header>
      <div id="v2DrawerHome" class="v2-drawer-home">
        <button data-v2="explore">🔍<span><b>附近探索</b><small>查看起點或終點附近的設施</small></span></button>
        <button data-v2="weather">🌤️<span><b>天氣資訊</b><small>中央氣象署嘉義市預報</small></span></button>
        <button data-v2="loop">🚶<span><b>散步圈與主題探索</b><small>依時間與綠意偏好規劃散步圈</small></span></button>
        <button data-v2="backupHub">⭐<span><b>收藏與雲端備份</b><small>收藏管理與手動雲端備份</small></span></button>
        <button data-v2="report">⚠️<span><b>路況回報</b><small>提交問題與查看處理進度</small></span></button>
      </div>
      <div id="v2DrawerSub" class="v2-drawer-sub" hidden></div>
    </section>`;
  getActiveMapHost().appendChild(box);

  // Follow Leaflet controls so the floating header cannot cover these tools.
  function alignMapTools(){
    const host=getMapWrap(),pegman=$('streetViewPegman'),hint=$('streetViewHint');
    if(!host)return;
    const bounds=host.getBoundingClientRect();
    const headerBottom=document.fullscreenElement?bounds.top:($('top-bar')?.getBoundingClientRect().bottom||bounds.top);
    host.style.setProperty('--chiayi-controls-top',Math.max(8,headerBottom-bounds.top+8)+'px');
    const corner=host.querySelector('.leaflet-top.leaflet-right');
    const zoom=host.querySelector('.leaflet-control-zoom');
    if(corner&&pegman){
      const top=Math.max(12,corner.getBoundingClientRect().top-bounds.top+10);
      pegman.style.top=top+'px';
      if(hint)hint.style.top=(top+46)+'px';
    }
    if(zoom)box.style.setProperty('top',(zoom.getBoundingClientRect().bottom-bounds.top+12)+'px','important');
  }
  const layoutObserver=new ResizeObserver(()=>requestAnimationFrame(alignMapTools));
  layoutObserver.observe(getMapWrap());
  if($('top-bar'))layoutObserver.observe($('top-bar'));
  window.addEventListener('resize',alignMapTools);
  document.addEventListener('fullscreenchange',()=>requestAnimationFrame(alignMapTools));
  alignMapTools();
  window.ChiayiCommunity.mount(panel,closeFeatureModal);
  const shortcut=(parent,type,label)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>openTool(type);parent.append(b);return b;};
  const header=document.createElement('div');header.className='chiayi-header-actions';document.querySelector('.header-right').append(header);
  shortcut(header,'install','📲');shortcut(header,'account','👤');const bell=shortcut(header,'notifications','🔔');bell.id='notificationBell';bell.setAttribute('aria-label','站內通知');
  header.children[0].title='安裝樹導航';header.children[0].setAttribute('aria-label','安裝樹導航');header.children[1].title='帳號與個人隱私';header.children[1].setAttribute('aria-label','帳號與個人隱私');
  const left=document.createElement('div');left.className='chiayi-side-actions';document.querySelector('.panel-controls').prepend(left);shortcut(left,'nav','🧭 即時導航');
  const right=document.createElement('div');right.className='chiayi-side-actions';document.querySelector('.panel-stats').prepend(right);
  for(const [type,label] of [['favorite','⭐ 收藏'],['share','🔗 分享'],['history','🕘 歷史'],['along','🌿 沿途探索']])shortcut(right,type,label);
  window.ChiayiTraffic.mount(map,layerControl);
  const peg=$('streetViewPegman');peg.hidden=true;
  window.addEventListener('chiayi-route-ready',()=>{peg.hidden=false;});
  window.addEventListener('chiayi-route-planning',()=>{peg.hidden=true;});
  $('resetBtn').addEventListener('click',()=>{toolsEpoch++;peg.hidden=true;savedTools.clear();document.querySelectorAll('#v2FeatureModal .v2-feature-body').forEach(n=>n.remove());$('toolDock')?.replaceChildren();activeToolTitle='';closeFeatureModal();});


  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);
  ['pointerdown','mousedown','touchstart','dblclick'].forEach(type=>{
    box.addEventListener(type,e=>e.stopPropagation(),{passive:true});
  });

  $('v2MoreBtn').onclick=e=>{e.stopPropagation();toggleDrawer()};
  $('v2DrawerClose').onclick=e=>{e.stopPropagation();closeDrawer()};
  // 每個功能按鈕直接綁定事件，避免 Leaflet / 地圖 click 攔截
  $('v2DrawerHome').querySelectorAll('[data-v2]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      openTool(btn.dataset.v2);
    });
  });

  document.addEventListener('fullscreenchange',moveToolsToFullscreen);
  document.addEventListener('webkitfullscreenchange',moveToolsToFullscreen);
}

function moveToolsToFullscreen(){
  const host=getActiveMapHost(),tools=$('v2MapTools'),hud=$('navHudV2');
  if(host&&tools&&tools.parentElement!==host)host.appendChild(tools);
  if(host&&hud&&hud.parentElement!==host)host.appendChild(hud);
  if($('toolDock'))host.appendChild($('toolDock'));
  setTimeout(()=>map.invalidateSize(),80);
}

function toggleDrawer(force){
  const d=$('v2MapDrawer'),b=$('v2MoreBtn');
  if(!d||!b)return;
  const shouldOpen=force===undefined?d.hidden:!!force;
  d.hidden=!shouldOpen;
  b.setAttribute('aria-expanded',String(shouldOpen));
  if(shouldOpen)showHome();
}
function closeDrawer(){
  if($('v2MapDrawer'))$('v2MapDrawer').hidden=true;
  $('v2MoreBtn')?.setAttribute('aria-expanded','false');
}
function showHome(){
  $('v2DrawerTitle').textContent='探索與工具';
  $('v2DrawerHome').hidden=false;
  $('v2DrawerSub').hidden=true;
  $('v2DrawerSub').innerHTML='';
}
const savedTools=new Map();
let activeToolTitle='';
const persistentTitles=new Set(['🔍 附近探索','🚶 綠色散步圈','🌤️ 嘉義市天氣','🌿 沿途探索']);
function restoreTool(title){
  const body=savedTools.get(title);if(!body)return false;
  panel(title,null);return true;
}
function dockTool(){
 const title=activeToolTitle;if(!title)return;
 if(persistentTitles.has(title)&&$('v2ModalBody'))savedTools.set(title,$('v2ModalBody'));
 let dock=$('toolDock');if(!dock){dock=document.createElement('div');dock.id='toolDock';getActiveMapHost().append(dock);L.DomEvent.disableClickPropagation(dock);}
 let b=[...dock.children].find(x=>x.dataset.title===title);
 if(!b){b=document.createElement('button');b.type='button';b.dataset.title=title;dock.append(b);}
 const selection=title==='🔍 附近探索'?$('poiType')?.selectedOptions[0]?.textContent:title==='🌿 沿途探索'?$('alongType')?.selectedOptions[0]?.textContent:title==='🚶 綠色散步圈'?$('loopMsg')?.innerText.split('\n')[1]:$('weatherDistrict')?.value;
 b.textContent=title+(selection?' · '+selection:'')+' ▴';b.onclick=()=>{if(savedTools.has(title))restoreTool(title);else{const modal=$('v2FeatureModal');if(activeToolTitle===title){modal.hidden=false;document.body.classList.add('v2-modal-open');}else openTool(b.dataset.tool||'account');}};
 // Nonpersistent forms are not retained across account switches or other forms.
 if(!persistentTitles.has(title))b.remove();
}
function ensureFeatureModal(){
  let modal=$('v2FeatureModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='v2FeatureModal';
  modal.className='v2-feature-modal';
  modal.hidden=true;
  modal.innerHTML=`
    <div class="v2-feature-backdrop" data-modal-close></div>
    <section class="v2-feature-window" role="dialog" aria-modal="true" aria-labelledby="v2ModalTitle">
      <header class="v2-feature-header">
        <div><small>附加功能</small><h2 id="v2ModalTitle">功能</h2></div>
        <button id="v2ModalMin" class="v2-modal-close" type="button" aria-label="收合工具">−</button><button id="v2ModalClose" class="v2-modal-close" type="button" aria-label="關閉">×</button>
      </header>
      <div id="v2ModalBody" class="v2-feature-body"></div>
    </section>`;
  document.body.appendChild(modal);
  $('v2ModalClose').onclick=closeFeatureModal;
  $('v2ModalMin').onclick=closeFeatureModal;
  modal.querySelector('[data-modal-close]').onclick=closeFeatureModal;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!modal.hidden)closeFeatureModal();
    if(e.key==='Tab'&&!modal.hidden){
      const items=[...modal.querySelectorAll('button,input,select,textarea,a[href]')].filter(x=>!x.disabled&&x.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  });
  return modal;
}
function closeFeatureModal(){
  const modal=$('v2FeatureModal');
  if(!modal)return;
  dockTool();
  modal.hidden=true;
  document.body.classList.remove('v2-modal-open');
  $('v2MoreBtn')?.focus({preventScroll:true});
}
function panel(title,html){
  const modal=ensureFeatureModal();
  (document.fullscreenElement||document.body).appendChild(modal);
  $('v2ModalTitle').textContent=title;
  const old=$('v2ModalBody');
  if(old){old.removeAttribute('id');old.hidden=true;if(persistentTitles.has(activeToolTitle))savedTools.set(activeToolTitle,old);else old.remove();}
  let p=savedTools.get(title);
  if(!p){p=document.createElement('div');p.className='v2-feature-body';modal.querySelector('.v2-feature-window').append(p);}
  p.id='v2ModalBody';p.hidden=false;
  if(html!==null)p.innerHTML=html;
  activeToolTitle=title;
  modal.hidden=false;
  document.body.classList.add('v2-modal-open');
  closeDrawer();
  $('v2ModalClose').focus({preventScroll:true});
  return p;
}
function note(s){return `<div class="v2-note">ⓘ ${s}</div>`}

function openTool(type){
  const titles={explore:'🔍 附近探索',loop:'🚶 綠色散步圈',weather:'🌤️ 嘉義市天氣',along:'🌿 沿途探索'};
  if(titles[type]&&restoreTool(titles[type]))return;
  if(type==='along')return alongUI();
  if(type==='history')return window.ChiayiCommunity.open('history');
  if(type==='notifications')return window.ChiayiCommunity.open('notifications');
  if(type==='backupHub'){const p=panel('⭐ 收藏與雲端備份','<button id="openFavorites">本機收藏</button><button id="openBackup">雲端備份／還原</button>');p.querySelector('#openFavorites').onclick=()=>openTool('favorite');p.querySelector('#openBackup').onclick=()=>openTool('backup');return;}

  if(['favorite','share','account','backup','report','admin'].includes(type))return window.ChiayiCommunity.open(type);
  if(type==='traffic')return window.ChiayiTraffic.open(panel);
  if(type==='install')return window.ChiayiPWA.open(panel);
  if(type==='explore')return exploreUI();
  if(type==='loop')return loopUI();
  if(type==='weather')return weatherUI();
  if(type==='nav')return navUI();

}

const datasets={
  parks:['公園綠地','data/parks.geojson','🌳'],
  pet:['寵物友善店家','data/pet_friendly.geojson','🐾'],
  toilet:['公共／親子廁所','data/toilets.geojson','🚻'],
  cool:['Cool Map 涼爽點','data/cool_map.json','❄️'],
  wifi:['iTaiwan 熱點','data/itaiwan.geojson','📶']
};

function poiIcon(type){
  const emoji=datasets[type]?.[2]||'📍';
  return L.divIcon({
    className:'v2-poi-divicon',
    html:`<div class="v2-poi-pin"><span>${emoji}</span></div>`,
    iconSize:[34,40],iconAnchor:[17,38],popupAnchor:[0,-35]
  });
}

function exploreUI(){
  const p=panel('🔍 附近探索',`
    ${note('可查看起點 A 或終點 B 附近的設施，結果依距離由近到遠排列。')}
    <label>搜尋位置</label>
    <div class="v2-segment">
      <button type="button" data-near="start" class="active">A 起點附近</button>
      <button type="button" data-near="end">B 終點附近</button>
    </div>
    <label>探索類型</label>
    <select id="poiType">
      <option value="parks">🌳 公園綠地</option>
      <option value="pet">🐾 寵物友善店家</option>
      <option value="toilet">🚻 公共／親子廁所</option>
      <option value="wifi">📶 iTaiwan 熱點</option>
      <option value="cool">❄️ Cool Map 涼爽點</option>
    </select>
    <div class="v2-actions">
      <button id="poiLoad" class="primary" type="button">顯示在地圖</button>
      <button id="poiClear" type="button">清除</button>
    </div>
    <div id="poiList" class="v2-poi-list"></div>`);
  selectedNear='start';
  p.querySelectorAll('[data-near]').forEach(b=>b.onclick=()=>{
    selectedNear=b.dataset.near;
    p.querySelectorAll('[data-near]').forEach(x=>x.classList.toggle('active',x===b));
  });
  $('poiLoad').onclick=loadPoi;
  $('poiClear').onclick=()=>{ensurePoiLayer().clearLayers();$('poiList').innerHTML=''};
}

async function loadPoi(){
  const epoch=toolsEpoch;
  const type=$('poiType').value,list=$('poiList');
  const [label,url,emoji]=datasets[type];
  list.textContent='讀取中…';
  try{
    const gj=await poiData(type);if(epoch!==toolsEpoch)return;
    ensurePoiLayer().clearLayers();
    const start=(typeof startLatLng!=='undefined'?startLatLng:null);
    const end=(typeof endLatLng!=='undefined'?endLatLng:null);
    const center=selectedNear==='end'?(end||map.getCenter()):(start||map.getCenter());
    const endpoint=selectedNear==='end'?(end?'終點 B':'地圖中心'):(start?'起點 A':'地圖中心');

    const rows=gj.features
      .filter(f=>f.geometry?.type==='Point')
      .map(f=>{
        const [lng,lat]=f.geometry.coordinates;
        return {f,d:map.distance(center,[lat,lng])};
      })
      .sort((a,b)=>a.d-b.d).slice(0,80);

    list.innerHTML=`<div class="v2-list-title">${emoji} ${endpoint}附近・${label}</div>`;
    rows.forEach(({f,d})=>{
      const [lng,lat]=f.geometry.coordinates,p=f.properties||{};
      const name=p.name||p.NAME||p.名稱||label;
      const addr=p.address||p.location||p.地址||'';
      const marker=L.marker([lat,lng],{icon:poiIcon(type)})
        .bindPopup(`<b>${emoji} ${escapeHtml(name)}</b><br>${escapeHtml(addr)}<br>距離${endpoint}約 ${Math.round(d)} m`)
        .addTo(poiLayer);
      const row=document.createElement('div');
      row.className='v2-poi-item';
      row.innerHTML=`<span>${emoji}</span><div><b>${escapeHtml(name)}</b><small>距離${endpoint} ${Math.round(d)} m${addr?' ・ '+escapeHtml(addr):''}</small></div>`;
      row.onclick=()=>{closeFeatureModal();map.setView([lat,lng],17);marker.openPopup()};
      list.appendChild(row);
    });
    closeFeatureModal();
  }catch(e){list.textContent=e.message}
}

async function poiData(type){
 const response=await fetch(datasets[type][1]);if(!response.ok)throw Error('探索資料讀取失敗');const data=await response.json();
 if(type!=='cool')return data;
 return {type:'FeatureCollection',features:data.filter(x=>x.city==='嘉義市'&&Number.isFinite(+x.longitude)&&Number.isFinite(+x.latitude)).map(x=>({type:'Feature',geometry:{type:'Point',coordinates:[+x.longitude,+x.latitude]},properties:{name:x.placename,address:[x.address,x.openinghours, x.airconditioning==='1'?'有冷氣':'',x.waterdispenser==='1'?'有飲水機':'',x.restroom==='1'?'有廁所':''].filter(Boolean).join(' · ')}}))};
}
function alongUI(){
 const p=panel('🌿 沿途探索',`${note('先設定起終點並完成路徑規劃，再尋找路線兩側 300 公尺內的設施。距離是直線距離，不代表可直接步行到達。')}<label>探索路線<select id="alongRoute"><option value="shortest">最短路線</option><option value="ndvi">綠暴露路線</option><option value="gvi">綠視率路線</option></select></label><label>類型<select id="alongType">${Object.entries(datasets).map(([k,v])=>`<option value="${k}">${v[2]} ${v[0]}</option>`).join('')}</select></label><button id="alongGo">顯示在地圖上</button><button id="alongClear">清除探索點</button><div id="alongResults" role="status"></div>`);
 $('alongClear').onclick=()=>{ensurePoiLayer().clearLayers();$('alongResults').textContent='已清除';};
 $('alongGo').onclick=async()=>{const epoch=toolsEpoch;const out=$('alongResults');const route=window.lastRouteFeatures?.[$('alongRoute').value];if(!startLatLng||!endLatLng||!route){out.textContent='請先設定起點與終點，完成路徑規劃。';return;}
 const type=$('alongType').value;out.textContent='尋找沿途設施…';try{const data=await poiData(type);if(epoch!==toolsEpoch)return;const rows=data.features.filter(f=>f.geometry?.type==='Point').map(f=>({f,d:turf.pointToLineDistance(f,route,{units:'meters'})})).filter(x=>x.d<=300).sort((a,b)=>a.d-b.d).slice(0,80);ensurePoiLayer().clearLayers();out.replaceChildren();
 const heading=document.createElement('p');heading.textContent=`路線周邊找到 ${rows.length} 處（最多顯示 80 處）`;out.append(heading);
 for(const {f,d} of rows){const [lng,lat]=f.geometry.coordinates;const props=f.properties||{};const name=props.name||props.NAME||props.名稱||datasets[type][0];const info=document.createElement('div');info.textContent=name+' · '+(props.address||props.地址||'')+' · 距路線約 '+Math.round(d)+' m';const marker=L.marker([lat,lng],{icon:poiIcon(type)}).bindPopup(info).addTo(poiLayer);const b=document.createElement('button');b.textContent=name+' · '+Math.round(d)+' m';b.onclick=()=>{closeFeatureModal();map.setView([lat,lng],17);marker.openPopup();};out.append(b);}
 closeFeatureModal();}catch(e){out.textContent=e.message;}};
}
function loopUI(){
  const p=panel('🚶 綠色散步圈',`
    ${note('數字代表預計散步的總時間。系統會以目前起點 A 作為起點與終點，沿嘉義市道路規劃閉合散步路線。')}
    <label>預計散步時間</label>
    <select id="loopMin">
      <option value="10">10 分鐘</option><option value="15">15 分鐘</option>
      <option value="20" selected>20 分鐘</option><option value="30">30 分鐘</option>
      <option value="45">45 分鐘</option><option value="60">60 分鐘</option>
    </select>
    <label>綠意偏好</label>
    <select id="loopMetric"><option value="ndvi">優先高 reNDVI</option><option value="gvi">優先高 GVI</option></select>
    <button id="loopGo" class="primary v2-wide" type="button">產生散步圈</button>
    <div id="loopMsg" class="v2-note">請先設定起點 A。</div>`);
  $('loopGo').onclick=createLoop;
}

async function createLoop(){
  const epoch=toolsEpoch;
  const start=(typeof startLatLng!=='undefined'?startLatLng:null);
  if(!start)return alert('請先設定起點 A');
  const msg=$('loopMsg');
  msg.textContent='正在搜尋可閉合的散步圈…';
  try{
    const r=await fetch(API+'/exploration/loop',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lat:start.lat,lon:start.lng,minutes:+$('loopMin').value,metric:$('loopMetric').value})
    });
    const d=await r.json();
    if(epoch!==toolsEpoch)return;
    if(!r.ok)throw Error(d.error||d.message||'找不到散步圈');

    clearLoop(false);
    loopLayer=L.geoJSON(d.route,{style:{
      color:'#C56A4A',weight:7,opacity:.95,lineCap:'round',lineJoin:'round'
    }}).addTo(map);
    map.fitBounds(loopLayer.getBounds(),{padding:[35,35]});
    window.chiayiLoopRoute=d.route;

    msg.innerHTML=`<b>✓ 散步圈完成</b><br>約 ${d.route.properties?.length_m??'—'} m／${d.route.properties?.duration_min??$('loopMin').value} 分鐘
      <div class="v2-actions"><button id="loopNav" class="primary">🧭 開始導航</button><button id="loopAgain">↻ 重新規劃</button><button id="loopClear">清除</button></div>`;
    $('loopNav').onclick=()=>{closeDrawer();startNav('loop')};
    $('loopAgain').onclick=createLoop;
    $('loopClear').onclick=()=>clearLoop(true);
    $('streetViewPegman').hidden=false;closeFeatureModal();
  }catch(e){msg.textContent=e.message}
}

function clearLoop(updateMessage=true){
  if(loopLayer&&map.hasLayer(loopLayer))map.removeLayer(loopLayer);
  loopLayer=null;
  window.chiayiLoopRoute=null;
  if(updateMessage&&$('loopMsg'))$('loopMsg').textContent='散步圈已清除，可重新規劃。';
}
window.clearChiayiLoop=()=>clearLoop(false);

function weatherUI(){
  panel('🌤️ 嘉義市天氣',`
    ${note('資料來源：中央氣象署 F-D0047-059。')}
    <label>行政區</label>
    <select id="weatherDistrict"><option value="東區">東區</option><option value="西區">西區</option></select>
    <button id="weatherGo" class="primary v2-wide" type="button">取得天氣預報</button>
    <div id="weatherOut" class="v2-weather-out"></div>`);
  $('weatherGo').onclick=loadWeather;
  $('weatherDistrict').addEventListener('change', loadWeather);

  // 開啟天氣功能時直接載入目前預設行政區（預設東區）。
  loadWeather();
}
function weatherEmoji(description){
  if(/雷/.test(description))return '⛈️';
  if(/雪|冰雹/.test(description))return '❄️';
  if(/雨/.test(description))return '🌧️';
  if(/霧|靄/.test(description))return '🌫️';
  if(/陰/.test(description))return '☁️';
  if(/晴/.test(description))return /雲/.test(description)?'🌤️':'☀️';
  if(/多雲/.test(description))return '⛅';
  return '🌡️';
}
let weatherRequest=0;
async function loadWeather(){
  const request=++weatherRequest;
  const out=$('weatherOut'),district=$('weatherDistrict').value;
  out.setAttribute('role','status');out.textContent='讀取中…';
  const add=(tag,text,parent,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;parent.appendChild(el);return el;};
  const format=t=>{const d=new Date(t);return Number.isNaN(d.getTime())?'時間未提供':d.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});};
  try{
    const r=await fetch(API+'/weather/forecast?district='+encodeURIComponent(district));
    const d=await r.json();
    if(request!==weatherRequest||!out.isConnected)return;
    if(!r.ok)throw Error(d.message||'天氣資料無法取得');
    if(!Array.isArray(d.rows)||!d.rows.length)throw Error('目前沒有可顯示的天氣預報');
    const groups={};
    d.rows.forEach(x=>(groups[x.start]??=[]).push(x));
    out.replaceChildren();
    add('p',district+' · 近期預報（臺灣時間）',out,'v2-weather-location');
    Object.entries(groups).sort(([a],[b])=>new Date(a)-new Date(b)).slice(0,4).forEach(([t,rows])=>{
      const card=add('section','',out,'v2-weather-card');
      add('h3',format(t)+(rows[0].end?' – '+format(rows[0].end):''),card);
      const value=row=>{const v=row?.value||{};return v.Weather??v.WeatherDescription??Object.values(v)[0]??'—';};
      const description=value(rows.find(x=>x.element==='天氣現象'));
      const summary=add('div','',card,'v2-weather-summary');
      const icon=add('span',weatherEmoji(String(description)),summary,'v2-weather-icon');icon.setAttribute('aria-hidden','true');
      add('strong',description==='—'?'天氣概況未提供':description,summary);
      const metrics=add('div','',card,'v2-weather-metrics');
      for(const [name,label,unit] of [['平均溫度','🌡️ 平均氣溫','°C'],['12小時降雨機率','☔ 降雨機率','%'],['平均相對濕度','💧 相對濕度','%']]){
        const row=rows.find(x=>x.element===name),raw=value(row);
        const item=add('div','',metrics);
        add('span',label,item);add('strong',raw==='—'||raw===''||Number(raw)<0?'—':String(raw)+unit,item);
      }
      const detail=rows.find(x=>x.element==='天氣預報綜合描述');
      if(detail){const details=add('details','',card,'v2-weather-details');add('summary','查看完整預報',details);add('p',value(detail),details);}
    });
    add('p','行政區預報，非沿途即時天氣；— 表示該時段未提供資料。',out,'feature-note');
  }catch(e){if(request===weatherRequest&&out.isConnected)out.textContent=e.message;}
}


function navUI(){
  const hasLoop=!!window.chiayiLoopRoute;
  const p=panel('🧭 即時導航',`
    ${note('選擇要跟隨的路線。開始後導航提示會顯示在地圖上方。')}
    <div class="v2-nav-route-select">
      <button data-route="ndvi">🌿 高綠暴露</button>
      <button data-route="gvi">🌳 高綠視率</button>
      <button data-route="shortest">最短路徑</button>
      ${hasLoop?'<button data-route="loop">🚶 散步圈</button>':''}
    </div>
    <label class="v2-check"><input id="navVoice" type="checkbox" checked> 語音提示</label>
    <div class="v2-note">轉向依路線幾何方位變化產生；沒有道路名稱資料時不會自行臆測。</div>`);
  p.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{closeDrawer();startNav(b.dataset.route)});
}

function bearing(a,b){
  const p=Math.PI/180,y=Math.sin((b[1]-a[1])*p)*Math.cos(b[0]*p),
        x=Math.cos(a[0]*p)*Math.sin(b[0]*p)-Math.sin(a[0]*p)*Math.cos(b[0]*p)*Math.cos((b[1]-a[1])*p);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function buildM(coords){
  const m=[];
  for(let i=2;i<coords.length-2;i++){
    const b1=bearing(coords[i-2],coords[i]),b2=bearing(coords[i],coords[i+2]);
    const d=((b2-b1+540)%360)-180;
    if(Math.abs(d)>32)m.push({i,text:Math.abs(d)>135?'迴轉':d>0?'右轉':'左轉'});
  }
  return m.filter((x,i)=>!i||x.i-m[i-1].i>3);
}
function speak(text,key){
  if(!navVoiceEnabled||spoken.has(key)||!('speechSynthesis'in window))return;
  spoken.add(key);
  const u=new SpeechSynthesisUtterance(text);u.lang='zh-TW';speechSynthesis.speak(u);
}
function startNav(type){
  const f=type==='loop'?window.chiayiLoopRoute:window.lastRouteFeatures?.[type];
  if(!f?.geometry?.coordinates)return alert('這條路線目前不存在，請先完成路徑規劃。');

  if(!navigator.geolocation)return alert('此瀏覽器不支援定位');
  if(!window.isSecureContext)return alert('定位需要 HTTPS 或 localhost');
  navVoiceEnabled=$('navVoice')?.checked!==false;
  stopNav();closeFeatureModal();
  navActive=true;window.chiayiNavigationActive=true;navMaxProgress=0;arrivalFixes=0;
  navCoords=f.geometry.coordinates.map(x=>[x[1],x[0]]);
  navTotal=navCoords.slice(1).reduce((sum,p,i)=>sum+map.distance(navCoords[i],p),0);
  maneuvers=buildM(navCoords);spoken.clear();
  if(navLayer)map.removeLayer(navLayer);
  navLayer=L.polyline(navCoords,{weight:8,opacity:.9}).addTo(map);

  let hud=$('navHudV2');
  if(!hud){
    hud=document.createElement('div');
    hud.id='navHudV2';hud.className='nav-hud-v2';
    hud.innerHTML=`<div class="main" id="navMain">正在取得位置…</div><div class="next" id="navNext"></div><div class="meta" id="navMeta2"></div><div id="navQuality" role="status"></div><button id="navFollow2" type="button">回到目前位置</button><button id="navStop2" type="button">結束導航</button>`;
    getActiveMapHost().appendChild(hud);
    $('navStop2').onclick=stopNav;
    $('navFollow2').onclick=()=>navView?.recenter();
  }
  hud.hidden=false;
  if(watch!==null)navigator.geolocation.clearWatch(watch);
  navView??=window.TreeNavigationView.create({map,getLayers:()=>[],onStatus:text=>{if($('navQuality'))$('navQuality').textContent=text;}});
  navView.start(navCoords,type==='loop'?'walk':$('modeSelect').value);
  navLastFix=Date.now();
  navTimer=setInterval(()=>{if(navActive&&Date.now()-navLastFix>15000){$('navMain').textContent='定位訊號中斷，等待新位置';$('navNext').textContent='';$('navMeta2').textContent='暫停轉向及抵達判斷';}},3000);
  watch=navigator.geolocation.watchPosition(updateNav,e=>{
    if(e.code===1){stopNav();alert('定位權限未開啟，已結束導航。請在瀏覽器允許定位後重試。');}
    else{$('navMain').textContent='定位暫時無法取得，等待重試';$('navNext').textContent='';}
  },{enableHighAccuracy:true,maximumAge:1500,timeout:12000});
  speak('導航開始','start');
}
function dist(a,b){return map.distance(a,b)}
function updateNav(pos){
  if(!navActive)return;
  const sample=navView.update(pos);if(!sample)return;
  navLastFix=Date.now();
  const p=sample.point;
  if(!userMarker)userMarker=L.marker(p,{icon:L.divIcon({className:'',html:'<div class="v2-user-dot"></div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map);
  else userMarker.setLatLng(p);
  const raw=[pos.coords.latitude,pos.coords.longitude];
  if(!accuracyLayer)accuracyLayer=L.circle(raw,{radius:sample.accuracy,color:'#477ea3',weight:1,fillOpacity:.08,interactive:false}).addTo(map);
  else accuracyLayer.setLatLng(raw).setRadius(sample.accuracy);
  if(!sample.snapped){
    arrivalFixes=0;
    $('navMain').textContent=sample.accuracy>25?'定位精度不足，暫不吸附路線':sample.reason==='ambiguous'?'路口位置待確認，請繼續前進':'目前未貼近規劃路線';
    $('navNext').textContent='確認位置後再提供轉向提示';
    $('navMeta2').textContent='GPS 精度 ±'+Math.round(sample.accuracy)+' m';return;
  }
  const nearest=sample.nearest,progress=sample.progress;
  navMaxProgress=Math.max(navMaxProgress,progress);
  const rem=nearest.remaining??Math.max(0,navTotal-progress);
  const bi=nearest.index,next=maneuvers.find(m=>m.i>bi);
  $('navMain').textContent='沿目前路線前進';
  $('navMeta2').textContent='剩餘 '+(rem<1000?Math.round(rem)+' m':(rem/1000).toFixed(2)+' km')+' · GPS ±'+Math.round(sample.accuracy)+' m · 已吸附';
  if(next){
    let d=map.distance(p,navCoords[bi+1]);for(let i=bi+1;i<next.i;i++)d+=dist(navCoords[i],navCoords[i+1]);
    $('navNext').textContent='約 '+Math.round(d)+' 公尺後 '+next.text;
    if(d<70)speak(Math.round(d)+'公尺後'+next.text,'m'+next.i);
  }else $('navNext').textContent='繼續前往目的地';
  const arrived=rem<25&&navMaxProgress>navTotal*.8&&sample.accuracy<=20&&map.distance(raw,navCoords.at(-1))<25;
  arrivalFixes=arrived?arrivalFixes+1:0;
  if(arrivalFixes>=3){$('navMain').textContent='已抵達目的地附近';speak('已抵達目的地附近','arrive');}
}
function stopNav(){
  if(watch!==null)navigator.geolocation.clearWatch(watch);watch=null;
  clearInterval(navTimer);navTimer=null;navActive=false;window.chiayiNavigationActive=false;
  navView?.stop();
  if(navLayer)map.removeLayer(navLayer);navLayer=null;
  if(userMarker)map.removeLayer(userMarker);userMarker=null;
  if(accuracyLayer)map.removeLayer(accuracyLayer);accuracyLayer=null;
  $('navHudV2')?.setAttribute('hidden','');
  if('speechSynthesis'in window)speechSynthesis.cancel();
}

/* 路徑規劃完成後可由主頁呼叫這個函式，自動凸顯導航 */
window.openChiayiNavigation=()=>{
  toggleDrawer(true);
  navUI();
};

/* 若主頁重新設定 A/B，可呼叫這個函式清除舊散步圈。 */
window.resetChiayiExtraRoutes=()=>clearLoop(false);

window.addEventListener('DOMContentLoaded',()=>setTimeout(mount,150));
})();

// Route library bridge: reuse the existing route rendering and metrics.
window.ChiayiRouteBridge={
  center:()=>({lat:map.getCenter().lat,lng:map.getCenter().lng}),
  load(record,data=null){
    const r=window.ChiayiRecords.clean(record);
    document.getElementById('resetBtn').click();
    startLatLng=L.latLng(r.start.lat,r.start.lng);endLatLng=L.latLng(r.end.lat,r.end.lng);
    startMarker=L.marker(startLatLng,{icon:createRouteMarker('A','#15803d')}).addTo(map).bindPopup('起點 A');
    endMarker=L.marker(endLatLng,{icon:createRouteMarker('B','#f1d58b')}).addTo(map).bindPopup('終點 B');
    enableStartMarkerRightClick(startMarker);enableEndMarkerRightClick(endMarker);
    document.getElementById('modeSelect').value=r.mode;
    document.getElementById('modeSelect').dispatchEvent(new Event('change'));
    document.getElementById('extraMinutes').value=r.extra_minutes||'';
    pointInfo.textContent='已載入起終點設定';
    window.chiayiPendingSnapshot=data;
    document.getElementById('dualPathBtn').click();
  }
};
