"""Chiayi TDX vehicle detectors. Credentials remain on the server.

No synthetic traffic and no routing effect. Deployment requires a TDX account
and confirmation that the Chiayi city VD feeds are available to that account.
"""
import json
import math
import os
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix='/traffic', tags=['chiayi-traffic'])
BASE = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/'
TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
_lock = threading.Lock()
_token = {'value': '', 'expires': 0}
_cache = {'at': 0, 'next': 0, 'data': None, 'static': None, 'static_at': 0}


def download(request):
    with urlopen(request, timeout=12) as response:
        raw = response.read(8_000_001)
    if len(raw) > 8_000_000:
        raise ValueError('Oversized feed')
    return json.loads(raw)


def token():
    if _token['expires'] > time.time():
        return _token['value']
    data = urlencode({'grant_type': 'client_credentials', 'client_id': os.environ['TDX_CLIENT_ID'], 'client_secret': os.environ['TDX_CLIENT_SECRET']}).encode()
    result = download(Request(TOKEN_URL, data=data, headers={'Content-Type': 'application/x-www-form-urlencoded'}))
    _token.update(value=result['access_token'], expires=time.time() + max(0, float(result.get('expires_in', 300)) - 60))
    return _token['value']


def feed(kind):
    result = download(Request(BASE + kind + '/City/Chiayi?$format=JSON', headers={'Authorization': 'Bearer ' + token(), 'Accept': 'application/json'}))
    if isinstance(result, dict):
        result = result.get('VDs' if kind == 'VD' else 'VDLives', [])
    if not isinstance(result, list):
        raise ValueError('Unexpected feed')
    return result


def number(value, maximum=10000):
    if value is None or isinstance(value, bool):
        return None
    try:
        n = float(value)
        return n if math.isfinite(n) and 0 <= n <= maximum else None
    except (ValueError, TypeError):
        return None


def state(row, now=None):
    try:
        dt = datetime.fromisoformat(row.get('time', ''))
        if dt.tzinfo is None:
            return 'stale'
        age = (time.time() if now is None else now) - dt.timestamp()
    except (TypeError, ValueError):
        return 'missing'
    if age > 300 or age < -60:
        return 'stale'
    if str(row.get('deviceStatus')) != '0':
        return 'fault'
    return 'ok' if row.get('flowRate') is not None or row.get('speed') is not None else 'missing'


def normalize(stations, observations):
    live = {x.get('VDID'): x for x in observations}
    result = []
    for station in stations:
        point = station.get('Position') or {}
        lat = number(station.get('PositionLat', point.get('PositionLat')), 90)
        lng = number(station.get('PositionLon', point.get('PositionLon')), 180)
        if lat is None or lng is None or not (23.35 <= lat <= 23.60 and 120.30 <= lng <= 120.60):
            continue
        row = live.get(station.get('VDID'), {})
        numerator = denominator = 0
        partial = False
        rates = []
        flow_complete = True
        for link in row.get('LinkFlows', []):
            lane_volumes = []
            lanes = link.get('Lanes', [])
            if not lanes:
                flow_complete = False
            for lane in lanes:
                speed = number(lane.get('Speed'), 200)
                volumes = [number(v.get('Volume')) for v in lane.get('Vehicles', [])]
                if volumes and all(v is not None for v in volumes):
                    lane_volumes.append(sum(volumes))
                else:
                    flow_complete = False
                if speed is None or not volumes or any(v is None for v in volumes):
                    partial = True
                    continue
                volume = sum(volumes)
                numerator += speed * volume
                denominator += volume
            if lane_volumes:
                rates.append(sum(lane_volumes) / len(lanes))
        result.append({'id': str(station.get('VDID', ''))[:100], 'road': str(station.get('RoadName', '車流測站'))[:120],
                       'lat': lat, 'lng': lng, 'time': row.get('DataCollectTime'), 'deviceStatus': row.get('Status'),
                       'flowRate': round(max(rates), 2) if rates and flow_complete else None,
                       'speed': round(numerator / denominator, 1) if denominator else None, 'partial': partial})
    return result


@router.get('/chiayi')
def traffic():
    if not os.getenv('TDX_CLIENT_ID') or not os.getenv('TDX_CLIENT_SECRET'):
        raise HTTPException(503, '即時交通尚未啟用，目前沒有車流資料。')
    with _lock:
        now = time.time()
        if now >= _cache['next']:
            _cache['next'] = now + 60
            try:
                if _cache['static'] is None or now - _cache['static_at'] > 86400:
                    _cache.update(static=feed('VD'), static_at=now)
                data = normalize(_cache['static'], feed('VDLive'))
                _cache.update(data=data, at=now)
            except Exception:
                # Do not expose the token or secret in response/log output.
                if not _cache['data'] or now - _cache['at'] > 300:
                    raise HTTPException(503, 'TDX 嘉義車流暫時無法取得，請確認資料供應與服務授權') from None
        if _cache['data'] is None or now - _cache['at'] > 300:
            raise HTTPException(503, '車流資料已過期，請稍後重試')
        rows = [{**row, 'state': state(row, now)} for row in _cache['data']]
        return {'source': '交通部 TDX · 嘉義市 VD', 'fetchedAt': datetime.fromtimestamp(_cache['at'], timezone.utc).isoformat(), 'stations': rows}
