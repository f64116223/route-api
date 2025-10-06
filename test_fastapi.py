from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import pickle
import networkx as nx
from scipy.spatial import KDTree
from pyproj import Transformer
import os
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="健康導向路徑測試 API")

# ------------------ CORS ------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ 讀取路網 ------------------
pkl_path = os.path.join(os.path.dirname(__file__), "data/Kao_Road_intersect25m_濃度_最大連通版.pkl")

if not os.path.exists(pkl_path):
    raise FileNotFoundError(f"找不到路網檔案: {pkl_path}")

with open(pkl_path, "rb") as f:
    G = pickle.load(f)

# ------------------ 邊屬性修正 ------------------
for u, v, d in G.edges(data=True):
    if 'attr_dict' in d:
        for key, value in d['attr_dict'].items():
            d[key] = value

# ------------------ 投影 EPSG:3826 -> EPSG:4326 ------------------
transformer_to4326 = Transformer.from_crs("EPSG:3826", "EPSG:4326", always_xy=True)
mapping = {}
latlon_nodes = []

for node in G.nodes:
    lon, lat = transformer_to4326.transform(node[0], node[1])
    mapping[(lat, lon)] = node
    G.nodes[node]["latlon"] = (lat, lon)
    latlon_nodes.append((lat, lon))

G.graph["latlon_nodes"] = latlon_nodes
G.graph["node_lookup"] = mapping
kdtree = KDTree(latlon_nodes)

def find_nearest_node(lat, lon):
    dist, idx = kdtree.query((lat, lon))
    return G.graph["node_lookup"][G.graph["latlon_nodes"][idx]]

# ------------------ 計算距離 ------------------
def calc_distance_m(coords):
    """coords: list of [lon, lat]"""
    total = 0
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:3826", always_xy=True)
    prev_x, prev_y = transformer.transform(coords[0][0], coords[0][1])
    for lon, lat in coords[1:]:
        x, y = transformer.transform(lon, lat)
        total += ((x - prev_x)**2 + (y - prev_y)**2)**0.5
        prev_x, prev_y = x, y
    return total

# ------------------ API ------------------
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
            return JSONResponse(content={"error": "權重只能是 'length' 或 'PM25_expo'"}, status_code=400)

        start_node = find_nearest_node(start_lat, start_lon)
        end_node = find_nearest_node(end_lat, end_lon)

        if not nx.has_path(G, start_node, end_node):
            return JSONResponse(content={"error": "起點與終點之間無可達路徑"}, status_code=400)

        path_nodes = nx.shortest_path(G, source=start_node, target=end_node, weight=weight)
        coords = [G.nodes[node]["latlon"] for node in path_nodes]

        geojson = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[lon, lat] for lat, lon in coords]},
            "properties": {
                "weight": weight,
                "nodes_count": len(path_nodes),
                "distance_m": calc_distance_m([[lon, lat] for lat, lon in coords])
            }
        }
        return JSONResponse(content=geojson)
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

# ------------------ 主程式 ------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("test_fastapi:app", host="0.0.0.0", port=8000, reload=True)
