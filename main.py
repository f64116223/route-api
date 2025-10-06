from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

# 🔓 允許跨來源（讓 ArcGIS Online、網頁都能用這個 API）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "健康導向路徑 API 運作中 🚀"}

# 🌍 路徑規劃 API（先放測試用範例）
@app.get("/route")
def get_route(start_lat: float, start_lon: float, end_lat: float, end_lon: float, weight: str):
    data = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [start_lon, start_lat],
                [end_lon, end_lat]
            ]
        },
        "properties": {
            "weight": weight
        }
    }
    return JSONResponse(content=data)
