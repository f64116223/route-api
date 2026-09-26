from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

import pickle
import networkx as nx
import numpy as np
from scipy.spatial import cKDTree
from shapely.geometry import LineString
from shapely.ops import linemerge
from pyproj import Transformer
import os
from google.cloud import storage
from google.api_core.exceptions import NotFound


# =====================================================
# DEBUG：檢查目前 Cloud Run / 本機檔案
# =====================================================

print("=== DEBUG FILES ===")
print("CWD:", os.getcwd())
print("ROOT:", os.listdir())

if os.path.exists("data"):
    print("DATA:", os.listdir("data"))
else:
    print("❌ data 資料夾不存在")


# =====================================================
# FastAPI 初始化
# =====================================================

app = FastAPI(
    title="嘉義市綠色導航 API"
)

from community import router as community_router
app.include_router(community_router)
from traffic_chiayi import router as traffic_router
app.include_router(traffic_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================================
# 福衛八號 private GCS 圖磚
# Cloud Run 以自身 Service Account 讀取 private bucket
# =====================================================

FORMOSAT_BUCKET = os.getenv("FORMOSAT_BUCKET", "chiayi_formosat8_private")
FORMOSAT_PREFIX = os.getenv("FORMOSAT_PREFIX", "formosat8_tiles")

# Client 在容器啟動時建立一次，避免每張圖磚都重新初始化。
storage_client = storage.Client()
formosat_bucket = storage_client.bucket(FORMOSAT_BUCKET)


@app.get("/formosat8/{z}/{x}/{y}.png")
def get_formosat8_tile(z: int, x: int, y: int):
    # 限制在實際已切好的 zoom 範圍，避免不必要的 Storage 請求。
    if z < 11 or z > 18 or x < 0 or y < 0:
        raise HTTPException(status_code=404, detail="Tile not found")

    blob_path = f"{FORMOSAT_PREFIX}/{z}/{x}/{y}.png"
    blob = formosat_bucket.blob(blob_path)

    try:
        image_bytes = blob.download_as_bytes()
    except NotFound:
        raise HTTPException(status_code=404, detail="Tile not found")
    except Exception as e:
        print(f"❌ FORMOSAT TILE ERROR: {blob_path}: {e}")
        raise HTTPException(status_code=502, detail="Unable to load tile")

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={
            # 瀏覽器可快取一天；private 避免共用 proxy cache 保存影像。
            "Cache-Control": "private, max-age=86400"
        },
    )


# =====================================================
# 讀取路網 PKL
# =====================================================

PKL_PATH = os.path.join(
    "data",
    "chiayi_NDVI_GVI.pkl"
)

if not os.path.exists(PKL_PATH):
    raise FileNotFoundError(
        f"找不到路網檔案：{PKL_PATH}"
    )

with open(PKL_PATH, "rb") as f:
    G = pickle.load(f)


print("=== 路網載入完成 ===")
print("Graph type:", type(G))
print("Nodes:", G.number_of_nodes())
print("Edges:", G.number_of_edges())


# =====================================================
# Edge Debug
# =====================================================

for u, v, data in G.edges(data=True):

    print("=== Sample Edge ===")
    print("Start:", u)
    print("End:", v)

    print("length_m:", data.get("length_m"))
    print("NDVI_MAX:", data.get("NDVI_MAX"))
    print("GVI_MEAN:", data.get("GVI_MEAN"))
    print("GVI_NORM:", data.get("GVI_NORM"))

    break


# =====================================================
# KDTree
# 節點座標：EPSG:3826
# =====================================================

nodes_list = list(G.nodes())

nodes_array = np.array(
    nodes_list,
    dtype=float
)

kdtree = cKDTree(nodes_array)


def find_nearest_node_xy(
    x,
    y,
    max_distance=200.0
):

    dist, idx = kdtree.query(
        [x, y],
        k=1
    )

    if np.isinf(dist) or dist > max_distance:
        return None

    return tuple(nodes_array[idx])

def calculate_gvi_gain(base_value, improved_value):
    # GVI 相對提升率（%）；基準為零或缺值時無法計算。
    if base_value is None or improved_value is None or base_value <= 0:
        return None
    return round((improved_value - base_value) / base_value * 100, 2)

# =====================================================
# 座標轉換
# =====================================================

to_3826 = Transformer.from_crs(
    "EPSG:4326",
    "EPSG:3826",
    always_xy=True
)

to_wgs84 = Transformer.from_crs(
    "EPSG:3826",
    "EPSG:4326",
    always_xy=True
)


# =====================================================
# Edge 欄位安全讀取
# =====================================================

def get_edge_attribute(
    edge_data,
    key
):

    if not isinstance(edge_data, dict):
        return None

    value = edge_data.get(key)

    if value is None:
        return None

    try:

        value = float(value)

        if np.isnan(value):
            return None

        return value

    except (TypeError, ValueError):

        return None


# =====================================================
# 權重參數
# =====================================================

NDVI_ALPHA = 2.0

# 舊 GVI_ALPHA 已停用，保留回傳鍵；reNDVI 的 NDVI_ALPHA 不變。
GVI_ALPHA = None
GVI_DISTANCE_PENALTY = 0.35


def get_raw_gvi(edge_data):
    # 已核對嘉義 PKL：GVI_MEAN 為百分比，GVI_NORM = GVI_MEAN / 100。
    value = get_edge_attribute(edge_data, "GVI_MEAN")
    if value is None or not np.isfinite(value):
        return None
    if not 0 <= value <= 100:
        raise ValueError("GVI_MEAN 必須為 0–100 的原始綠視率")
    return value / 100.0


gvi_values = [value for _, _, attrs in G.edges(data=True)
              if (value := get_raw_gvi(attrs)) is not None]
GVI_P05, GVI_P95 = (
    [float(v) for v in np.percentile(gvi_values, [5, 95])]
    if gvi_values else [0.0, 0.0]
)



# =====================================================
# 1. 最短距離權重
# =====================================================

def length_weight(
    u,
    v,
    edge_data
):

    length = get_edge_attribute(
        edge_data,
        "length_m"
    )

    if length is None or length <= 0:
        return 1e-6

    return length


# =====================================================
# 2. 高 NDVI 路徑權重
#
# cost =
#
# length × [1 + alpha × (1 - NDVI)]
#
# NDVI 越高 → 成本越低
# =====================================================

def ndvi_weight(
    u,
    v,
    edge_data
):

    length = get_edge_attribute(
        edge_data,
        "length_m"
    )

    if length is None or length <= 0:
        length = 1e-6


    ndvi = get_edge_attribute(
        edge_data,
        "NDVI_MAX"
    )

    if ndvi is None:
        ndvi = 0.0


    ndvi = float(
        np.clip(
            ndvi,
            0.0,
            1.0
        )
    )


    cost = length * (
        1.0 +
        NDVI_ALPHA * (1.0 - ndvi)
    )

    return cost


# =====================================================
# 3. 高 GVI 路徑權重
#
# 原始 GVI 以全路網第 5～95 百分位正規化，僅用於選路
#
# cost =
#
# length × [(1 - 正規化GVI) + 0.35]
#
# GVI 越高 → 成本越低
# =====================================================

def gvi_weight(u, v, edge_data):
    length = get_edge_attribute(edge_data, "length_m")
    if length is None or length <= 0:
        length = 1e-6
    gvi = get_raw_gvi(edge_data)
    normalized = 0.0
    if gvi is not None and GVI_P95 > GVI_P05:
        normalized = float(np.clip((gvi - GVI_P05) / (GVI_P95 - GVI_P05), 0, 1))
    # 缺值只在選路成本採最低分，不當成零值納入暴露平均。
    return length * ((1.0 - normalized) + GVI_DISTANCE_PENALTY)


# =====================================================
# 路徑累積
#
# 每一條路徑都計算：
#
# 1. 實際距離
# 2. NDVI × 距離
# 3. GVI × 距離
# 4. 長度加權平均 NDVI
# 5. 長度加權平均 GVI
# 6. geometry
# =====================================================

def accumulate_path(
    path_nodes
):

    if not path_nodes or len(path_nodes) < 2:

        return (
            None,
            None,
            None,
            None,
            None,
            None
        )


    total_length = 0.0

    total_ndvi_length = 0.0

    total_gvi_length = 0.0
    gvi_observed_length = 0.0

    segments = []


    for i in range(
        len(path_nodes) - 1
    ):

        u = path_nodes[i]

        v = path_nodes[i + 1]


        edge_data = G.get_edge_data(
            u,
            v
        )

        if edge_data is None:
            continue


        # =============================================
        # length
        # =============================================

        length = get_edge_attribute(
            edge_data,
            "length_m"
        )

        if length is None or length <= 0:
            continue


        # =============================================
        # NDVI
        # =============================================

        ndvi = get_edge_attribute(
            edge_data,
            "NDVI_MAX"
        )

        if ndvi is None:
            ndvi = 0.0

        ndvi = float(
            np.clip(
                ndvi,
                0.0,
                1.0
            )
        )


        # =============================================
        # GVI
        #
        # 使用原始 GVI 比例；缺值不算入 GVI 平均分母。
        # =============================================

        gvi = get_raw_gvi(edge_data)


        # =============================================
        # 累積
        # =============================================

        total_length += length

        total_ndvi_length += (
            ndvi * length
        )

        if gvi is not None:
            total_gvi_length += gvi * length
            gvi_observed_length += length


        # =============================================
        # Geometry
        # =============================================

        geom = edge_data.get(
            "geometry"
        )

        if geom is None:

            geom = LineString(
                [u, v]
            )

        segments.append(geom)


    # =================================================
    # 長度加權平均 NDVI / GVI
    # =================================================

    if total_length > 0:

        mean_ndvi = (
            total_ndvi_length /
            total_length
        )

        mean_gvi = (
            total_gvi_length / gvi_observed_length
            if gvi_observed_length > 0 else None
        )

    else:

        mean_ndvi = None

        mean_gvi = None


    # =================================================
    # 合併 Geometry
    # =================================================

    if segments:

        try:

            merged_geom = linemerge(
                segments
            )

        except Exception:

            merged_geom = segments[0]

    else:

        merged_geom = None


    return (
        total_length,
        total_ndvi_length,
        mean_ndvi,
        total_gvi_length if gvi_observed_length > 0 else None,
        mean_gvi,
        merged_geom
    )


# =====================================================
# Geometry → GeoJSON
# =====================================================

def geom_to_geojson_coords(
    geom
):

    if geom is None:
        return []


    if geom.geom_type == "LineString":

        coords = []

        for x, y in geom.coords:

            lon, lat = to_wgs84.transform(
                x,
                y
            )

            coords.append(
                [lon, lat]
            )

        return coords


    elif geom.geom_type == "MultiLineString":

        all_coords = []

        for line in geom.geoms:

            for x, y in line.coords:

                lon, lat = to_wgs84.transform(
                    x,
                    y
                )

                all_coords.append(
                    [lon, lat]
                )

        return all_coords


    return []


# =====================================================
# 建立每一個路段的 GeoJSON 資料
#
# 前端可使用這些路段值，將規劃完成的路線依 reNDVI / GVI
# 逐段套用漸層顏色，而不是整條路徑只使用單一顏色。
# =====================================================

def build_route_segments(path_nodes):

    if not path_nodes or len(path_nodes) < 2:
        return []

    route_segments = []

    for u, v in zip(path_nodes, path_nodes[1:]):

        edge_data = G.get_edge_data(u, v)

        if not edge_data:
            continue

        length = get_edge_attribute(edge_data, "length_m")
        ndvi = get_edge_attribute(edge_data, "NDVI_MAX")
        gvi = get_raw_gvi(edge_data)

        geom = edge_data.get("geometry")
        if geom is None:
            geom = LineString([u, v])

        # 每個 edge 盡量整理成一條 LineString。
        if geom.geom_type == "MultiLineString":
            try:
                geom = linemerge(geom)
            except Exception:
                pass

        coords_3826 = []

        if geom.geom_type == "LineString":
            coords_3826 = list(geom.coords)
        elif geom.geom_type == "MultiLineString":
            for line in geom.geoms:
                coords_3826.extend(list(line.coords))

        if len(coords_3826) < 2:
            coords_3826 = [u, v]

        # 道路 geometry 有時候方向與 route node 的 u→v 相反；
        # 這裡依 u 點距離判斷後翻轉，讓前端逐段繪製時方向一致。
        ux, uy = float(u[0]), float(u[1])
        first_x, first_y = coords_3826[0]
        last_x, last_y = coords_3826[-1]

        first_dist2 = (first_x - ux) ** 2 + (first_y - uy) ** 2
        last_dist2 = (last_x - ux) ** 2 + (last_y - uy) ** 2

        if last_dist2 < first_dist2:
            coords_3826.reverse()

        coords_wgs84 = []
        for x, y in coords_3826:
            lon, lat = to_wgs84.transform(x, y)
            coords_wgs84.append([lon, lat])

        if ndvi is not None:
            ndvi = float(np.clip(ndvi, 0.0, 1.0))

        route_segments.append({
            "coordinates": coords_wgs84,
            "length_m": length,
            "ndvi": ndvi,
            "gvi": gvi,
            "gvi_percent": (gvi * 100.0 if gvi is not None else None)
        })

    return route_segments


# =====================================================
# 建立 GeoJSON Feature
# =====================================================

def create_route_feature(
    length_m,
    mean_ndvi,
    mean_gvi,
    geom,
    path_nodes
):

    if geom is None:
        return None


    return {

        "type": "Feature",

        "geometry": {

            "type": "LineString",

            "coordinates":
            geom_to_geojson_coords(
                geom
            )

        },

        "properties": {

            "length_m":
            length_m,

            "mean_ndvi":
            mean_ndvi,

            # 0 ~ 1
            "mean_gvi":
            mean_gvi,

            # 前端顯示百分比方便使用
            "mean_gvi_percent":
            (
                mean_gvi * 100
                if mean_gvi is not None
                else None
            ),

            # 逐路段 reNDVI / GVI，提供前端漸層路線使用
            "segments": build_route_segments(path_nodes)

        }

    }



# =====================================================
# 路線高綠意推薦點
#
# 規則：
# 1. 候選來源為規劃完成後的「高 reNDVI 路徑」與「高 GVI 路徑」。
# 2. 分別使用全路網 P05～P95 將 NDVI / GVI 正規化到 0～1。
# 3. 同時有兩種資料時，score = 0.5 * NDVI + 0.5 * GVI。
#    若某一指標缺值，則使用另一個有效指標，不把缺值當成 0。
# 4. 先依 score 由高到低排序，再用最小間距避免 5 個點全部擠在一起。
# 5. 回傳 WGS84 座標，前端可直接畫 Leaflet marker / 開 Street View。
# =====================================================

ndvi_values_for_spots = [
    value
    for _, _, attrs in G.edges(data=True)
    if (
        (value := get_edge_attribute(attrs, "NDVI_MAX")) is not None
        and np.isfinite(value)
    )
]

NDVI_SPOT_P05, NDVI_SPOT_P95 = (
    [float(v) for v in np.percentile(ndvi_values_for_spots, [5, 95])]
    if ndvi_values_for_spots
    else [0.0, 1.0]
)


def _normalize_spot_value(value, low, high):
    if value is None or not np.isfinite(value):
        return None

    if not np.isfinite(low) or not np.isfinite(high) or high <= low:
        return 0.5

    return float(
        np.clip(
            (float(value) - low) / (high - low),
            0.0,
            1.0
        )
    )


def _segment_midpoint_wgs84(edge_data, u, v):
    geom = edge_data.get("geometry")

    if geom is None:
        geom = LineString([u, v])

    try:
        if geom.geom_type == "MultiLineString":
            geom = linemerge(geom)

        if geom.geom_type == "LineString":
            point = geom.interpolate(
                0.5,
                normalized=True
            )
        elif geom.geom_type == "MultiLineString":
            # linemerge 後仍為 MultiLineString 時，取最長的一段。
            line = max(
                geom.geoms,
                key=lambda g: g.length
            )
            point = line.interpolate(
                0.5,
                normalized=True
            )
        else:
            x = (float(u[0]) + float(v[0])) / 2.0
            y = (float(u[1]) + float(v[1])) / 2.0
            lon, lat = to_wgs84.transform(x, y)
            return float(lat), float(lon)

        lon, lat = to_wgs84.transform(
            point.x,
            point.y
        )

        return float(lat), float(lon)

    except Exception:
        x = (float(u[0]) + float(v[0])) / 2.0
        y = (float(u[1]) + float(v[1])) / 2.0
        lon, lat = to_wgs84.transform(x, y)
        return float(lat), float(lon)


def _distance_m_3826(candidate_a, candidate_b):
    dx = candidate_a["x"] - candidate_b["x"]
    dy = candidate_a["y"] - candidate_b["y"]
    return float(np.hypot(dx, dy))


def build_green_spots(
    path_nodes,
    route_type,
    limit=5
):
    """
    從單一路徑挑出最多 5 個推薦點。
    reNDVI 路徑以 NDVI_MAX 為主要排序；
    GVI 路徑以 GVI 為主要排序。
    """
    if not path_nodes or len(path_nodes) < 2:
        return []

    candidates = []
    seen_edges = set()

    for u, v in zip(path_nodes, path_nodes[1:]):
        edge_key = frozenset((u, v))
        if edge_key in seen_edges:
            continue
        seen_edges.add(edge_key)

        edge_data = G.get_edge_data(u, v)
        if not edge_data:
            continue

        ndvi = get_edge_attribute(edge_data, "NDVI_MAX")
        if ndvi is not None:
            ndvi = float(np.clip(ndvi, 0.0, 1.0))

        gvi = get_raw_gvi(edge_data)

        ndvi_score = _normalize_spot_value(
            ndvi, NDVI_SPOT_P05, NDVI_SPOT_P95
        )
        gvi_score = _normalize_spot_value(
            gvi, GVI_P05, GVI_P95
        )

        if route_type == "ndvi":
            if ndvi_score is None:
                continue
            primary_score = ndvi_score
            secondary_score = gvi_score if gvi_score is not None else 0.0
        elif route_type == "gvi":
            if gvi_score is None:
                continue
            primary_score = gvi_score
            secondary_score = ndvi_score if ndvi_score is not None else 0.0
        else:
            continue

        green_score = float(
            0.90 * primary_score +
            0.10 * secondary_score
        )

        lat, lon = _segment_midpoint_wgs84(edge_data, u, v)
        mx, my = to_3826.transform(lon, lat)

        candidates.append({
            "lat": lat,
            "lng": lon,
            "x": float(mx),
            "y": float(my),
            "ndvi": ndvi,
            "gvi_percent": (
                float(gvi * 100.0)
                if gvi is not None
                else None
            ),
            "primary_score": float(primary_score),
            "green_score": green_score,
            "route_type": route_type
        })

    if not candidates:
        return []

    candidates.sort(
        key=lambda item: (
            item["primary_score"],
            item["green_score"]
        ),
        reverse=True
    )

    xs = [item["x"] for item in candidates]
    ys = [item["y"] for item in candidates]
    route_span = float(
        np.hypot(
            max(xs) - min(xs),
            max(ys) - min(ys)
        )
    )

    spacing_candidates = [
        min(120.0, max(35.0, route_span / 8.0)),
        60.0,
        30.0,
        0.0
    ]

    selected = []

    for min_spacing_m in spacing_candidates:
        selected = []

        for candidate in candidates:
            if all(
                _distance_m_3826(candidate, chosen) >= min_spacing_m
                for chosen in selected
            ):
                selected.append(candidate)

            if len(selected) >= limit:
                break

        if len(selected) >= limit:
            break

    return [
        {
            "rank": rank,
            "lat": item["lat"],
            "lng": item["lng"],
            "ndvi": item["ndvi"],
            "gvi_percent": item["gvi_percent"],
            "green_score": round(item["green_score"], 4),
            "route_type": item["route_type"]
        }
        for rank, item in enumerate(selected[:limit], start=1)
    ]

# =====================================================
# 計算改善率
# =====================================================

def calculate_improvement(
    base_value,
    improved_value
):

    if (
        base_value is not None
        and improved_value is not None
        and base_value > 0
    ):

        return round(

            (
                improved_value
                -
                base_value
            )
            /
            base_value
            *
            100,

            2

        )

    return 0.0


# =====================================================
# 額外步行時間限制：在多組綠意權重候選中，選擇不超過時間上限且綠意最佳者
# 嘉義目前前端步行基準為 3 km/h，因此 1 分鐘約 50 m。
# =====================================================
def _path_length(nodes):
    return sum(length_weight(u, v, G.get_edge_data(u, v)) for u, v in zip(nodes, nodes[1:]))

def _path_metric(nodes, key):
    total = weighted = 0.0
    for u, v in zip(nodes, nodes[1:]):
        data = G.get_edge_data(u, v)
        length = get_edge_attribute(data, "length_m")
        if not length or length <= 0:
            continue
        if key == "ndvi":
            value = get_edge_attribute(data, "NDVI_MAX")
            value = float(np.clip(value if value is not None else 0.0, 0, 1))
        else:
            value = get_raw_gvi(data)
            if value is None:
                continue
        total += length; weighted += value * length
    return weighted / total if total else 0.0

def green_path_with_extra_minutes(start_node, end_node, shortest_nodes, metric, extra_minutes):
    if extra_minutes not in (3, 5, 10):
        raise ValueError("extra_minutes 只接受 3、5、10")
    max_length = _path_length(shortest_nodes) + extra_minutes * 50.0
    best = shortest_nodes
    best_score = _path_metric(best, metric)
    # 多組強度產生候選；只有符合明確距離/時間上限者才參與比較。
    for strength in (0.5, 1.0, 2.0, 4.0, 8.0):
        def candidate_weight(u, v, data):
            length = length_weight(u, v, data)
            if metric == "ndvi":
                value = get_edge_attribute(data, "NDVI_MAX")
                value = float(np.clip(value if value is not None else 0.0, 0, 1))
            else:
                value = get_raw_gvi(data)
                value = value if value is not None else 0.0
            return length * float(np.exp(-strength * value))
        try:
            candidate = nx.shortest_path(G, start_node, end_node, weight=candidate_weight)
        except nx.NetworkXNoPath:
            continue
        if _path_length(candidate) > max_length + 1e-6:
            continue
        score = _path_metric(candidate, metric)
        if score > best_score + 1e-9:
            best, best_score = candidate, score
    return best

# =====================================================
# API：路徑查詢
#
# mode:
#
# ndvi
# gvi
# both
#
# =====================================================

def add_gvi_properties(feature, path_nodes):
    """只補 GVI 暴露與覆蓋率；不修改 NDVI 或路線幾何。"""
    if feature is None or not path_nodes:
        return
    total = observed = exposure = 0.0
    for u, v in zip(path_nodes, path_nodes[1:]):
        attrs = G.get_edge_data(u, v)
        length = get_edge_attribute(attrs, "length_m")
        if length is None or length <= 0:
            continue
        total += length
        gvi = get_raw_gvi(attrs)
        if gvi is not None:
            observed += length
            exposure += gvi * length
    coverage = observed / total if total > 0 else 0.0
    feature["properties"].update({
        "gvi_exposure_length": exposure if observed > 0 else None,
        "gvi_observed_length_m": observed,
        "gvi_coverage_ratio": coverage,
        "gvi_coverage_percent": coverage * 100,
        "gvi_warning": "資料覆蓋率不足 60%，結果僅供參考" if coverage < 0.6 else None,
    })


@app.get("/route")
def get_route(

    start_lat: float = Query(...),

    start_lon: float = Query(...),

    end_lat: float = Query(...),

    end_lon: float = Query(...),

    mode: str = Query(
        "ndvi",
        description="路徑模式：ndvi、gvi、both"
    ),

    extra_minutes: int | None = Query(
        None,
        description="步行願意額外增加的時間：3、5、10 分鐘"
    )

):

    try:

        # =================================================
        # 0. 檢查 mode
        # =================================================

        mode = mode.lower().strip()


        if mode not in [
            "ndvi",
            "gvi",
            "both"
        ]:

            return JSONResponse(

                {
                    "error":
                    "mode 必須為 ndvi、gvi 或 both"
                },

                status_code=400

            )


        # =================================================
        # 1. WGS84 → TWD97
        # =================================================

        sx, sy = to_3826.transform(
            start_lon,
            start_lat
        )

        ex, ey = to_3826.transform(
            end_lon,
            end_lat
        )


        # =================================================
        # 2. 找最近路網節點
        # =================================================

        start_node = find_nearest_node_xy(
            sx,
            sy
        )

        end_node = find_nearest_node_xy(
            ex,
            ey
        )


        if (
            start_node is None
            or end_node is None
        ):

            return JSONResponse(

                {
                    "error":
                    "起點或終點距離路網過遠"
                },

                status_code=400

            )


        print("===================================")

        print(
            "Mode:",
            mode
        )

        print(
            "Start node:",
            start_node
        )

        print(
            "End node:",
            end_node
        )


        # =================================================
        # 3. 最短距離路徑
        #
        # 無論哪個 mode 都一定計算
        # =================================================

        shortest_nodes = nx.shortest_path(

            G,

            start_node,

            end_node,

            weight=length_weight

        )


        # =================================================
        # 4. NDVI 路徑
        # =================================================

        high_ndvi_nodes = None


        if mode in [
            "ndvi",
            "both"
        ]:

            high_ndvi_nodes = nx.shortest_path(

                G,

                start_node,

                end_node,

                weight=ndvi_weight

            )


        # =================================================
        # 5. GVI 路徑
        # =================================================

        high_gvi_nodes = None


        if mode in [
            "gvi",
            "both"
        ]:

            high_gvi_nodes = nx.shortest_path(

                G,

                start_node,

                end_node,

                weight=gvi_weight

            )


        # 使用者指定「願意多走幾分鐘」時，以明確步行時間上限重新挑選綠意候選。
        if extra_minutes is not None:
            if extra_minutes not in (3, 5, 10):
                return JSONResponse({"error":"extra_minutes 只接受 3、5、10"}, status_code=400)
            if high_ndvi_nodes is not None:
                high_ndvi_nodes = green_path_with_extra_minutes(start_node, end_node, shortest_nodes, "ndvi", extra_minutes)
            if high_gvi_nodes is not None:
                high_gvi_nodes = green_path_with_extra_minutes(start_node, end_node, shortest_nodes, "gvi", extra_minutes)

        # =================================================
        # 6. 最短路徑累積
        # =================================================

        (
            short_len,
            short_ndvi_length,
            short_mean_ndvi,
            short_gvi_length,
            short_mean_gvi,
            short_geom
        ) = accumulate_path(
            shortest_nodes
        )


        # =================================================
        # 7. NDVI 路徑累積
        # =================================================

        ndvi_len = None
        ndvi_mean_ndvi = None
        ndvi_mean_gvi = None
        ndvi_geom = None


        if high_ndvi_nodes is not None:

            (
                ndvi_len,
                ndvi_ndvi_length,
                ndvi_mean_ndvi,
                ndvi_gvi_length,
                ndvi_mean_gvi,
                ndvi_geom
            ) = accumulate_path(
                high_ndvi_nodes
            )


        # =================================================
        # 8. GVI 路徑累積
        # =================================================

        gvi_len = None
        gvi_mean_ndvi = None
        gvi_mean_gvi = None
        gvi_geom = None


        if high_gvi_nodes is not None:

            (
                gvi_len,
                gvi_ndvi_length,
                gvi_mean_ndvi,
                gvi_gvi_length,
                gvi_mean_gvi,
                gvi_geom
            ) = accumulate_path(
                high_gvi_nodes
            )


        # =================================================
        # 9. NDVI 改善率
        #
        # 高 NDVI 路徑 vs 最短路徑
        # =================================================

        ndvi_improvement_rate = None


        if high_ndvi_nodes is not None:

            ndvi_improvement_rate = (
                calculate_improvement(
                    short_mean_ndvi,
                    ndvi_mean_ndvi
                )
            )


        # =================================================
        # 10. GVI 改善率
        #
        # 高 GVI 路徑 vs 最短路徑
        # =================================================

        gvi_improvement_rate = None


        if high_gvi_nodes is not None:

            gvi_improvement_rate = calculate_gvi_gain(
                short_mean_gvi,
                gvi_mean_gvi
            )


        # =================================================
        # 11. 建立 GeoJSON
        # =================================================

        shortest_feature = create_route_feature(

            short_len,

            short_mean_ndvi,

            short_mean_gvi,

            short_geom,

            shortest_nodes

        )


        high_ndvi_feature = None


        if ndvi_geom is not None:

            high_ndvi_feature = create_route_feature(

                ndvi_len,

                ndvi_mean_ndvi,

                ndvi_mean_gvi,

                ndvi_geom,

                high_ndvi_nodes

            )


        high_gvi_feature = None


        if gvi_geom is not None:

            high_gvi_feature = create_route_feature(

                gvi_len,

                gvi_mean_ndvi,

                gvi_mean_gvi,

                gvi_geom,

                high_gvi_nodes

            )


        # =================================================
        # 12. Debug
        # =================================================

        print("-----------------------------------")

        print("最短路徑")

        print(
            "距離:",
            short_len
        )

        print(
            "平均 NDVI:",
            short_mean_ndvi
        )

        print(
            "平均 GVI:",
            short_mean_gvi
        )


        if high_ndvi_feature is not None:

            print("-----------------------------------")

            print("高 NDVI 路徑")

            print(
                "距離:",
                ndvi_len
            )

            print(
                "平均 NDVI:",
                ndvi_mean_ndvi
            )

            print(
                "平均 GVI:",
                ndvi_mean_gvi
            )

            print(
                "NDVI 改善率:",
                ndvi_improvement_rate,
                "%"
            )


        if high_gvi_feature is not None:

            print("-----------------------------------")

            print("高 GVI 路徑")

            print(
                "距離:",
                gvi_len
            )

            print(
                "平均 NDVI:",
                gvi_mean_ndvi
            )

            print(
                "平均 GVI:",
                gvi_mean_gvi
            )

            print(
                "GVI 改善率:",
                gvi_improvement_rate,
                "%"
            )


        print("===================================")


        # =================================================
        # 13. 路線高綠意推薦點
        # =================================================

        ndvi_green_spots = build_green_spots(
            high_ndvi_nodes,
            route_type="ndvi",
            limit=5
        )

        gvi_green_spots = build_green_spots(
            high_gvi_nodes,
            route_type="gvi",
            limit=5
        )


        # =================================================
        # 14. API 回傳
        # =================================================

        response = {

            # 前端知道這次選了哪個模式
            "mode":
            mode,


            # 最短路徑永遠存在
            "shortest_path":
            shortest_feature,


            # 權重參數
            "ndvi_alpha":
            NDVI_ALPHA,

            "gvi_alpha":
            GVI_ALPHA,

            # reNDVI 路徑自己的 5 個推薦點
            "ndvi_green_spots":
            ndvi_green_spots,

            # GVI 路徑自己的 5 個推薦點
            "gvi_green_spots":
            gvi_green_spots

        }


        # -------------------------------------------------
        # NDVI mode / both
        # -------------------------------------------------

        if mode in ["ndvi", "both"]:
            response["high_ndvi_path"] = high_ndvi_feature
            response["RENDVI"] = ndvi_improvement_rate

        if mode in ["gvi", "both"]:
            response["high_gvi_path"] = high_gvi_feature
            response["REGVI"] = gvi_improvement_rate

        add_gvi_properties(shortest_feature, shortest_nodes)
        add_gvi_properties(high_ndvi_feature, high_ndvi_nodes)
        add_gvi_properties(high_gvi_feature, high_gvi_nodes)
        response["gvi_distance_penalty"] = GVI_DISTANCE_PENALTY
        response["regvi_unit"] = "relative_percent"

        return response

    # =====================================================
    # 沒有路徑
    # =====================================================

    except nx.NetworkXNoPath:

        return JSONResponse(

            {
                "error":
                "起點與終點之間無可達路徑"
            },

            status_code=400

        )


    # =====================================================
    # 其他錯誤
    # =====================================================

    except Exception as e:

        print(
            "❌ API ERROR:",
            str(e)
        )

        return JSONResponse(

            {
                "error":
                str(e)
            },

            status_code=500

        )


# =====================================================
# 啟動
# =====================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080
    )



# V2 features
from v2_features import create_v2_router
app.include_router(create_v2_router(G,kdtree,nodes_array,to_3826,find_nearest_node_xy,length_weight,accumulate_path,geom_to_geojson_coords))
