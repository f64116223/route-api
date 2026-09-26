from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse, Response
from urllib.request import urlopen
from urllib.parse import urlencode
import json, math, os, random, time, networkx as nx


def create_v2_router(G, kdtree, nodes_array, to_3826, find_nearest_node_xy,
                     length_weight, accumulate_path, geom_to_geojson_coords):
    router = APIRouter()
    cache = {'at': 0, 'data': None}

    def plen(nodes):
        return sum(length_weight(u, v, G.get_edge_data(u, v))
                   for u, v in zip(nodes, nodes[1:]))

    def green(nodes, metric):
        _, _, ndvi, _, gvi, _ = accumulate_path(nodes)
        x = ndvi if metric == 'ndvi' else gvi
        return -1 if x is None else float(x)

    def ordered_route_coords(nodes):
        """依實際節點走訪順序串接 edge geometry，避免 linemerge 對閉合路線重新排序。"""
        all_coords = []
        for u, v in zip(nodes, nodes[1:]):
            data = G.get_edge_data(u, v) or {}
            geom = data.get('geometry')
            if geom is None:
                # 透過既有 geometry converter 處理簡單替代線段需要 shapely；
                # 若沒有 geometry，就延後用相鄰有 geometry 的端點，避免錯誤折線。
                continue

            # 判斷 geometry 原始 EPSG:3826 方向是否與 u -> v 一致。
            try:
                if geom.geom_type == 'LineString':
                    raw = list(geom.coords)
                    du = math.hypot(raw[0][0] - u[0], raw[0][1] - u[1])
                    dv = math.hypot(raw[-1][0] - u[0], raw[-1][1] - u[1])
                    coords = geom_to_geojson_coords(geom)
                    if dv < du:
                        coords.reverse()
                else:
                    coords = geom_to_geojson_coords(geom)
            except Exception:
                coords = geom_to_geojson_coords(geom)

            if not coords:
                continue
            if all_coords and all_coords[-1] == coords[0]:
                all_coords.extend(coords[1:])
            else:
                all_coords.extend(coords)

        # 散步圈的節點一定 start == end；GeoJSON 也強制首尾閉合。
        if all_coords and all_coords[0] != all_coords[-1]:
            all_coords.append(all_coords[0])
        return all_coords

    def feature(nodes, force_closed=False):
        length, _, ndvi, _, gvi, geom = accumulate_path(nodes)
        coords = ordered_route_coords(nodes) if force_closed else geom_to_geojson_coords(geom)
        if force_closed and coords and coords[0] != coords[-1]:
            coords.append(coords[0])
        return {
            'type': 'Feature',
            'geometry': {'type': 'LineString', 'coordinates': coords},
            'properties': {
                'length_m': round(length, 1),
                'duration_min': round(length / 3000 * 60, 1),
                'mean_ndvi': ndvi,
                'mean_gvi': gvi,
                'closed_loop': bool(force_closed and coords and coords[0] == coords[-1])
            }
        }

    @router.post('/exploration/loop')
    def loop(body: dict = Body(...)):
        """
        V4 散步圈：
        對多個 waypoint 尋找 start -> waypoint 的多條 simple path，
        以兩條內部重疊很少的路徑組成真正閉合環線：
            start -> waypoint (path A)
            waypoint -> start (reverse path B)

        相較「去程封路再找回程」，此法在棋盤狀都市路網的成功率高很多，
        又能避免三段 shortest path 產生星狀交叉與大量折返。
        """
        lat = float(body.get('lat'))
        lon = float(body.get('lon'))
        minutes = int(body.get('minutes', 20))
        metric = str(body.get('metric', 'ndvi'))

        if minutes not in (10, 15, 20, 30, 45, 60):
            return JSONResponse({'error': 'minutes 必須為 10/15/20/30/45/60'}, 400)
        if metric not in ('ndvi', 'gvi'):
            metric = 'ndvi'

        sx, sy = to_3826.transform(lon, lat)
        start = find_nearest_node_xy(sx, sy)
        if start is None:
            return JSONResponse({'error': '起點距離路網過遠'}, 400)

        # 3 km/h = 50 m/min。短環線較難形成，容許較寬的長度範圍。
        target = minutes * 50.0
        low = target * (0.62 if minutes <= 15 else 0.70)
        high = target * 1.35

        rng = random.Random(
            hash((round(lat, 4), round(lon, 4), minutes, metric)) & 0xffffffff
        )

        # waypoint 不宜離起點太遠，否則兩條路徑加總必然超過時間預算。
        radius = max(220.0, target * 0.46)
        idxs = kdtree.query_ball_point([sx, sy], r=radius)
        candidates = []

        for idx in idxs:
            n = tuple(nodes_array[idx])
            if n == start:
                continue
            straight = math.hypot(n[0] - sx, n[1] - sy)
            if target * 0.12 <= straight <= target * 0.43:
                candidates.append((straight, n))

        # 先打散，避免每次只偏向同一方向，再優先測較合適距離。
        rng.shuffle(candidates)
        candidates.sort(key=lambda item: abs(item[0] - target * 0.28))
        candidates = candidates[:55]

        found = []

        for _, waypoint in candidates:
            try:
                # shortest_simple_paths 依權重由短到長給替代路徑。
                generator = nx.shortest_simple_paths(
                    G, start, waypoint, weight=length_weight
                )

                alternatives = []
                for _ in range(7):
                    try:
                        p = next(generator)
                    except StopIteration:
                        break

                    L = plen(p)
                    if L <= high * 0.78:
                        alternatives.append((p, L))

                if len(alternatives) < 2:
                    continue

                for i in range(len(alternatives)):
                    p1, l1 = alternatives[i]
                    e1 = {frozenset((u, v)) for u, v in zip(p1, p1[1:])}
                    n1 = set(p1[1:-1])

                    for j in range(i + 1, len(alternatives)):
                        p2, l2 = alternatives[j]
                        e2 = {frozenset((u, v)) for u, v in zip(p2, p2[1:])}
                        n2 = set(p2[1:-1])

                        # 不接受兩條幾乎相同的替代路徑。
                        edge_overlap = len(e1 & e2) / max(1, min(len(e1), len(e2)))
                        node_overlap = len(n1 & n2) / max(1, min(len(n1), len(n2)))
                        if edge_overlap > 0.12 or node_overlap > 0.18:
                            continue

                        # p2 原本也是 start -> waypoint；反轉成 waypoint -> start。
                        back = list(reversed(p2))
                        route = p1 + back[1:]

                        if route[0] != start or route[-1] != start:
                            continue

                        L = plen(route)
                        if not (low <= L <= high):
                            continue

                        # 除 start 外，環線不應有太多重複節點。
                        interior = route[1:-1]
                        repeat_ratio = 1.0 - (
                            len(set(interior)) / max(1, len(interior))
                        )
                        if repeat_ratio > 0.12:
                            continue

                        g = green(route, metric)
                        time_penalty = abs(L - target) / target

                        # 綠意是主要品質，另懲罰時間偏差與路徑重疊。
                        score = (
                            g
                            - time_penalty * 0.18
                            - edge_overlap * 0.70
                            - repeat_ratio * 0.50
                        )
                        found.append((score, route, g, L))

            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
            except Exception as exc:
                print("loop candidate error:", repr(exc))
                continue

        if not found:
            return JSONResponse({
                'error': (
                    '目前起點附近暫時找不到符合時間的閉合道路環線。'
                    '建議改選 20／30 分鐘，或將起點移到街廓較完整的位置。'
                )
            }, 404)

        found.sort(reverse=True, key=lambda x: x[0])
        _, path, g, actual_length = found[0]

        # 節點層級再次保證閉合。
        if path[0] != path[-1]:
            path.append(path[0])

        route_feature = feature(path, force_closed=True)

        # GeoJSON 層級再次保證首尾座標完全相同。
        coords = route_feature['geometry']['coordinates']
        if coords and coords[0] != coords[-1]:
            coords.append(list(coords[0]))

        route_feature['properties']['closed_loop'] = True
        route_feature['properties']['target_minutes'] = minutes
        route_feature['properties']['target_length_m'] = round(target, 1)

        return {
            'kind': 'loop',
            'target_minutes': minutes,
            'metric': metric,
            'green_score': g,
            'closed': True,
            'actual_length_m': round(actual_length, 1),
            'route': route_feature
        }

    @router.get('/weather/forecast')
    def weather(district: str = Query('東區')):
        if district not in ('東區', '西區'):
            district = '東區'
        key = os.getenv('CWA_API_KEY', '').strip()
        if not key:
            return JSONResponse({'message': '尚未設定 CWA_API_KEY'}, 503)
        try:
            now = time.time()
            if not cache['data'] or now - cache['at'] > 600:
                # 保留目前已驗證成功的 CWA query-parameter 授權方式。
                url = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-059?' + urlencode({
                    'Authorization': key,
                    'format': 'JSON'
                })
                with urlopen(url, timeout=20) as r:
                    cache.update(at=now, data=json.load(r))

            locs = []
            for group in cache['data'].get('records', {}).get('Locations', []):
                locs += group.get('Location', [])
            loc = next((x for x in locs if x.get('LocationName') == district), None)
            if not loc:
                return JSONResponse({'message': '找不到行政區預報'}, 502)

            rows = []
            wanted = ('平均溫度', '12小時降雨機率', '天氣現象', '天氣預報綜合描述', '平均相對濕度')
            for el in loc.get('WeatherElement', []):
                name = el.get('ElementName', '')
                if name not in wanted:
                    continue
                for t in el.get('Time', [])[:8]:
                    rows.append({
                        'element': name,
                        'start': t.get('StartTime') or t.get('DataTime'),
                        'end': t.get('EndTime'),
                        'value': (t.get('ElementValue') or [{}])[0]
                    })
            return {'district': district, 'source': '中央氣象署', 'dataset': 'F-D0047-059', 'rows': rows}
        except Exception as e:
            print('CWA weather error:', repr(e))
            return JSONResponse({'message': '中央氣象署資料暫時無法取得'}, 503)

    @router.get('/chiayi/attractions')
    def attractions():
        url = 'https://data.chiayi.gov.tw/opendata/api/getResource?oid=ec9d2131-05b2-4960-a540-ce3ef8a67cae&rid=348e068f-b244-42c6-a66a-da65c73e6323'
        try:
            with urlopen(url, timeout=12) as r:
                raw = r.read()
            return Response(content=raw, media_type='application/xml; charset=utf-8', headers={'Cache-Control': 'public, max-age=3600'})
        except Exception:
            return JSONResponse({'message': '嘉義市景點資料暫時無法取得'}, 503)

    return router
