from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import networkx as nx
import pickle
from scipy.spatial import KDTree
from pyproj import Transformer
import os

app = FastAPI(title="健康導向路徑規劃 API")

# ------------------------------
# CORS（讓你的 HTML 可以請求 API）
# ------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# 根路由（Render 健康檢查用）
# ------------------------------
@app.get("/")
def home():
    return {"status": "API running successfully 🚀"}

# ------------------------------
# 載入路網
# ------------------------------
pkl_path = os.path.join(os.path.dirname(__file__), "/data/Kao_Road_intersect25m_濃度_最大連通版.pkl")

if not os.path.exists(pkl_path):
    raise FileNotFoundError(f"❌ 找不到路網檔案：{pkl_path}")

with open(pkl_path, "rb") as f:
    G = pickle.load(f)

# 修正 attr_dict 結構（某些 pickle 版本會包兩層）
for u, v, d in G.edges(data=True):
    if "attr_dict" in d:
        for key, val in d["attr_dict"].items():
            d[key] = val

# ------------------------------
# 建立投影轉換器：EPSG:3826 → EPSG:4326
# ------------------------------
transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)

mapping = {}
for node in G.nodes:
    lon, lat = transformer.transform(node[0], node[1])  # 注意順序 (x, y) -> (lon, lat)
    mapping[(lat, lon)] = node
    G.nodes[node]["latlon"] = (lat, lon)

latlon_nodes = list(mapping.keys())
node_lookup = mapping
kdtree = KDTree(latlon_nodes)


def find_nearest_node(lat, lon):
    """找到最接近座標的節點"""
    dist, idx = kdtree.query((lat, lon))
    nearest_node = node_lookup[latlon_nodes[idx]]
    return nearest_node, dist


# ------------------------------
# 路徑查詢 API
# ------------------------------
@app.get("/route")
def get_route(
    start_lat: float = Query(...),
    start_lon: float = Query(...),
    end_lat: float = Query(...),
    end_lon: float = Query(...),
    weight: str = Query("length")
):
    try:
        if weight not in ["length", "PM25_expo"]:
            return JSONResponse(content={"error": "weight 必須是 'length' 或 'PM25_expo'"}, status_code=400)

        start_node, start_dist = find_nearest_node(start_lat, start_lon)
        end_node, end_dist = find_nearest_node(end_lat, end_lon)

        print(f"Start node: {start_node}, dist={start_dist:.2f}")
        print(f"End node: {end_node}, dist={end_dist:.2f}")

        if not nx.has_path(G, start_node, end_node):
            return JSONResponse(content={"error": "起點與終點無法連通"}, status_code=400)

        path = nx.shortest_path(G, start_node, end_node, weight=weight)
        print(f"✅ Path found, node count: {len(path)}")

        if len(path) < 3:
            print("⚠️ 路徑太短，可能節點定位錯誤")

        coords = [G.nodes[n]["latlon"] for n in path]

        geojson = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon, lat] for lat, lon in coords],
            },
            "properties": {
                "weight": weight,
                "node_count": len(path)
            },
        }
        return JSONResponse(content=geojson)

    except Exception as e:
        print(f"❌ Error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)


# ------------------------------
# 本地測試用
# ------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("test_fastapi:app", host="0.0.0.0", port=8000, reload=True)
