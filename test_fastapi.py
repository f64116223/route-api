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
# CORS（讓 HTML 可以請求 API）
# ------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "API running successfully 🚀"}

# ------------------------------
# 載入路網
# ------------------------------
pkl_path = os.path.join(os.path.dirname(__file__), "data/Kao_Road_intersect25m_濃度_最大連通版.pkl")

if not os.path.exists(pkl_path):
    raise FileNotFoundError(f"❌ 找不到路網檔案：{pkl_path}")

with open(pkl_path, "rb") as f:
    G = pickle.load(f)

# 修正某些 pickle 版本會包兩層 attr_dict 的問題
for u, v, d in G.edges(data=True):
    if "attr_dict" in d:
        for key, val in d["attr_dict"].items():
            d[key] = val

# ------------------------------
# 建立投影轉換器（WGS84 → TWD97）
# ------------------------------
transformer = Transformer.from_crs("EPSG:4326", "EPSG:3826", always_xy=True)

# 取出所有節點的 (x, y) 座標（這是 EPSG:3826）
node_xy = list(G.nodes)
kdtree = KDTree(node_xy)

def find_nearest_node(lat, lon):
    """從經緯度找到圖中最近的節點"""
    x, y = transformer.transform(lon, lat)  # 轉成 3826 座標
    dist, idx = kdtree.query((x, y))
    nearest_node = node_xy[idx]
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

        # 再轉回經緯度（給前端畫圖）
        back_transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
        coords = []
        for n in path:
            lon, lat = back_transformer.transform(n[0], n[1])
            coords.append([lon, lat])

        geojson = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {"weight": weight, "node_count": len(path)},
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
