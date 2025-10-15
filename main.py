from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import pickle
import networkx as nx
from scipy.spatial import KDTree
from pyproj import Transformer
import os
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="健康導向路徑測試 API")

# 加上這個：健康檢查端點
@app.get("/health")
def health_check():
    return {"status": "ok"}

# -------------------------
# 讀取資料（放在啟動時做，而不是 import 時）
# -------------------------
@app.on_event("startup")
def load_data():
    global G, kdtree
    pkl_path = os.path.join("data", "Kao_Road_intersect25m_濃度_最大連通版.pkl")
    if not os.path.exists(pkl_path):
        raise FileNotFoundError(f"找不到路網檔案: {pkl_path}")

    print("🔹 載入路網中...")
    with open(pkl_path, "rb") as f:
        G = pickle.load(f)
    print("✅ 路網載入完成")

    for u, v, d in G.edges(data=True):
        if 'attr_dict' in d:
            for key, value in d['attr_dict'].items():
                d[key] = value

    transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
    mapping = {}
    for node in G.nodes:
        lon, lat = transformer.transform(node[0], node[1])
        mapping[(lat, lon)] = node
        G.nodes[node]["latlon"] = (lat, lon)

    G.graph["latlon_nodes"] = list(mapping.keys())
    G.graph["node_lookup"] = mapping
    kdtree = KDTree(G.graph["latlon_nodes"])

    print("✅ KDTree 準備完成")

# -------------------------
# 主要端點
# -------------------------
@app.get("/route")
def get_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    weight: str = "length"
):
    start_node = find_nearest_node(start_lat, start_lon)
    end_node = find_nearest_node(end_lat, end_lon)
    path = nx.shortest_path(G, source=start_node, target=end_node, weight=weight)
    coords = [G.nodes[node]["latlon"] for node in path]
    return {"path": coords}


def find_nearest_node(lat, lon):
    dist, idx = kdtree.query((lat, lon))
    return G.graph["node_lookup"][G.graph["latlon_nodes"][idx]]

# -------------------------
# 啟動（Cloud 平台共用）
# -------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
