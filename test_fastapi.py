from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import pickle
import networkx as nx
from scipy.spatial import KDTree
from pyproj import Transformer
import os
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

app = FastAPI(title="健康導向路徑測試 API")

# ------------------ CORS ------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# 讀取路網
# -------------------------
pkl_path = "data/Kao_Road_intersect25m_濃度_最大連通版.pkl"  # 相對路徑
if not os.path.exists(pkl_path):
    raise FileNotFoundError(f"找不到路網檔案: {pkl_path}")

with open(pkl_path, "rb") as f:
    G = pickle.load(f)

# 修正邊屬性格式
for u, v, d in G.edges(data=True):
    if 'attr_dict' in d:
        for key, value in d['attr_dict'].items():
            d[key] = value

# 投影轉換 EPSG:3826 → EPSG:4326
transformer = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)

mapping = {}
for node in G.nodes:
    lon, lat = transformer.transform(node[0], node[1])
    mapping[(lat, lon)] = node
    G.nodes[node]["latlon"] = (lat, lon)

G.graph["latlon_nodes"] = list(mapping.keys())
G.graph["node_lookup"] = mapping
kdtree = KDTree(G.graph["latlon_nodes"])

# -------------------------
# 改進的最近節點尋找
# -------------------------
def find_nearest_node(lat, lon, exclude_node=None):
    dists, idxs = kdtree.query((lat, lon), k=5)
    if not isinstance(idxs, (list, np.ndarray)):
        idxs = [idxs]
        dists = [dists]

    for dist, idx in zip(dists, idxs):
        node = G.graph["node_lookup"][G.graph["latlon_nodes"][idx]]
        if node != exclude_node:
            return node
    return G.graph["node_lookup"][G.graph["latlon_nodes"][idxs[0]]]

# -------------------------
# API 端點
# -------------------------
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
            return JSONResponse(content={"error": f"權重只能是 'length' 或 'PM25_expo'"}, status_code=400)

        start_node = find_nearest_node(start_lat, start_lon)
        end_node = find_nearest_node(end_lat, end_lon, exclude_node=start_node)

        if not nx.has_path(G, start_node, end_node):
            return JSONResponse(content={"error": "起點與終點之間無可達路徑"}, status_code=400)

        path = nx.shortest_path(G, source=start_node, target=end_node, weight=weight)
        coords = [G.nodes[node]["latlon"] for node in path]

        geojson = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in coords]},
            "properties": {"weight": weight, "nodes_count": len(path)}
        }

        return JSONResponse(content=geojson)

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# -------------------------
# Debug 印出統計數字
# -------------------------
lengths = [d.get("length", 0) for u, v, d in G.edges(data=True)]
pm25s = [d.get("PM25_expo", 0) for u, v, d in G.edges(data=True)]
print("Length:", min(lengths), max(lengths), sum(lengths)/len(lengths))
print("PM2.5:", min(pm25s), max(pm25s), sum(pm25s)/len(pm25s))

# -------------------------
# 主程式
# -------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("test_fastapi:app", host="0.0.0.0", port=8000, reload=True)
