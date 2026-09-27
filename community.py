"""Optional Chiayi accounts, explicit backups and private road reports.

Uses Cloud Run service identity (ADC). No service account key in the frontend.
Disabled by default; route planning does not depend on Firebase availability.
"""
import hashlib
import json
import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix='/community', tags=['chiayi-community'])


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


class Point(Strict):
    lat: float = Field(ge=23.35, le=23.60)
    lng: float = Field(ge=120.30, le=120.60)


class Favorite(Strict):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[\w-]+$')
    title: str = Field(min_length=1, max_length=80)
    mode: Literal['walk', 'bike']
    start: Point
    end: Point
    extra_minutes: Literal[3, 5, 10] | None = None

    @model_validator(mode='after')
    def valid_mode(self):
        if self.mode != 'walk' and self.extra_minutes is not None:
            raise ValueError('自行車不使用額外步行時間')
        return self


class Backup(Strict):
    version: Literal[1] = 1
    favorites: list[Favorite] = Field(max_length=30)


class Upload(Strict):
    consent: Literal[True]
    revision: int = Field(ge=0)
    data: Backup


class DeleteBackup(Strict):
    consent: Literal[True]
    revision: int = Field(ge=0)


class Report(Strict):
    id: str = Field(pattern=r'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
    category: Literal['construction', 'blocked', 'obstacle', 'flood', 'other']
    location: str = Field(min_length=2, max_length=160)
    note: str = Field(min_length=5, max_length=1000)
    point: Point | None = None
    consent: Literal[True]


class Review(Strict):
    status: Literal['pending', 'reviewing', 'resolved', 'dismissed']
    reply: str = Field(default='', max_length=500)
    public_reply: str = Field(default='', max_length=500)


def configured():
    return os.getenv('COMMUNITY_ENABLED', 'false').lower() == 'true' and bool(os.getenv('FIREBASE_PROJECT_ID'))


@lru_cache(maxsize=1)
def services():
    import firebase_admin
    from firebase_admin import auth
    from google.cloud import firestore
    project = os.environ['FIREBASE_PROJECT_ID']
    try:
        app = firebase_admin.get_app('chiayi-community')
    except ValueError:
        app = firebase_admin.initialize_app(options={'projectId': project}, name='chiayi-community')
    return app, auth, firestore.Client(project=project, database=os.getenv('FIRESTORE_DATABASE', 'chiayi-treeway'))


def guard(request: Request, response: Response, admin=False):
    response.headers['Cache-Control'] = 'no-store, private'
    if not configured():
        raise HTTPException(503, '帳號與回報服務尚未啟用，仍可使用本機收藏與路徑規劃。')
    origins = {v.strip() for v in os.getenv('COMMUNITY_ORIGINS', '').split(',') if v.strip()}
    if request.headers.get('origin') not in origins:
        raise HTTPException(403, '網站來源未授權')
    token = request.headers.get('authorization', '')
    if not token.startswith('Bearer ') or len(token) > 8192:
        raise HTTPException(401, '請先使用 Google 帳號登入')
    try:
        app, auth, _ = services()
        claims = auth.verify_id_token(token[7:], app=app, check_revoked=True)
    except Exception:
        raise HTTPException(401, '登入已過期或無效，請重新登入') from None
    if not claims.get('uid') or claims.get('email_verified') is not True or claims.get('firebase', {}).get('sign_in_provider') != 'google.com':
        raise HTTPException(403, '請使用已驗證的 Google 帳號')
    if admin and not is_admin(claims):
        raise HTTPException(403, '只有管理員可查看與處理回報')
    return claims


def is_admin(claims):
    emails = {s.strip().casefold() for s in os.getenv('COMMUNITY_ADMIN_EMAILS', '').split(',') if s.strip()}
    return claims.get('email', '').casefold() in emails


def document_id(uid):
    return hashlib.sha256(uid.encode()).hexdigest()


@router.get('/config')
def config(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return {'enabled': configured()}


@router.get('/me')
def me(request: Request, response: Response):
    user = guard(request, response)
    return {'email': user.get('email'), 'admin': is_admin(user)}


def backup_ref(user):
    return services()[2].collection('chiayi_backups').document(document_id(user['uid']))


@router.get('/backup')
def read_backup(request: Request, response: Response):
    user = guard(request, response)
    try:
        value = backup_ref(user).get().to_dict() or {}
        return {'revision': value.get('revision', 0), 'data': value.get('data'), 'updatedAt': value.get('updatedAt')}
    except Exception:
        raise HTTPException(503, '暫時無法讀取雲端備份') from None


def replace_backup(user, revision, data):
    from google.cloud import firestore
    ref = backup_ref(user)
    @firestore.transactional
    def commit(tx):
        old = ref.get(transaction=tx).to_dict() or {}
        if old.get('revision', 0) != revision:
            raise HTTPException(409, '雲端版本已更新，請重新讀取後再操作')
        row = {'revision': revision + 1, 'updatedAt': datetime.now(timezone.utc).isoformat(), 'data': data}
        tx.set(ref, row)
        return {'revision': row['revision'], 'updatedAt': row['updatedAt']}
    try:
        return commit(services()[2].transaction())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, '雲端備份暫時無法更新，請重新讀取確認結果') from None


@router.post('/backup')
def upload_backup(body: Upload, request: Request, response: Response):
    user = guard(request, response)
    return replace_backup(user, body.revision, body.data.model_dump())


@router.post('/backup/delete')
def delete_backup(body: DeleteBackup, request: Request, response: Response):
    user = guard(request, response)
    return replace_backup(user, body.revision, None)


@router.post('/reports')
def submit_report(body: Report, request: Request, response: Response):
    user = guard(request, response)
    from google.cloud import firestore
    db = services()[2]
    now = datetime.now(timezone.utc)
    owner = document_id(user['uid'])
    ref = db.collection('chiayi_reports').document(str(body.id))
    quota = db.collection('chiayi_quotas').document(owner + '-' + now.date().isoformat())
    value = body.model_dump(mode='json', exclude={'consent', 'id'})
    value['owner'] = owner
    digest = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    @firestore.transactional
    def commit(tx):
        existing = ref.get(transaction=tx)
        count = quota.get(transaction=tx).to_dict() or {}
        if existing.exists:
            if existing.to_dict().get('digest') != digest:
                raise HTTPException(409, '回報內容已變更，請重新開啟表單')
            return
        if count.get('count', 0) >= 10:
            raise HTTPException(429, '今日回報已達 10 筆，請明日再試')
        tx.set(quota, {'count': count.get('count', 0) + 1, 'expires_at': now + timedelta(days=2)})
        tx.create(db.collection('chiayi_admin_notifications').document(str(body.id)), {
            'title': '收到新的路況回報', 'report_id': str(body.id), 'created_at': now,
            'expires_at': now + timedelta(days=90)})
        tx.create(ref, {**value, 'digest': digest, 'status': 'pending', 'reply': '',
                        'created_at': now, 'updated_at': now, 'expires_at': now + timedelta(days=90)})
    try:
        commit(db.transaction())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, '無法確認回報是否儲存，請重試；同一份回報不會重複新增') from None
    return {'ok': True, 'id': str(body.id)}


@router.get('/admin/reports')
def reports(request: Request, response: Response, cursor: str | None = None):
    guard(request, response, admin=True)
    from google.cloud import firestore
    collection = services()[2].collection('chiayi_reports')
    # Match Firestore's default descending index, including its document-ID tie breaker.
    query = collection.order_by('created_at', direction=firestore.Query.DESCENDING).order_by(
        '__name__', direction=firestore.Query.DESCENDING)
    if cursor:
        try:
            UUID(cursor)
        except ValueError:
            raise HTTPException(422, '無效分頁') from None
        last = collection.document(cursor).get()
        if not last.exists:
            raise HTTPException(400, '分頁已失效，請重新整理')
        query = query.start_after(last)
    try:
        docs = list(query.limit(51).stream())
        rows = []
        for doc in docs[:50]:
            row = doc.to_dict()
            rows.append({'id': doc.id, **{k: row.get(k) for k in ('category', 'location', 'note', 'point', 'status', 'reply', 'public_reply', 'created_at', 'updated_at')}})
        return {'rows': rows, 'next': docs[49].id if len(docs) > 50 else None}
    except Exception:
        raise HTTPException(503, '無法讀取回報，請確認 Firestore 設定') from None


@router.patch('/admin/reports/{report_id}')
def review(report_id: UUID, body: Review, request: Request, response: Response):
    guard(request, response, admin=True)
    from google.cloud import firestore
    from uuid import uuid4
    db = services()[2]
    ref = db.collection('chiayi_reports').document(str(report_id))
    now = datetime.now(timezone.utc)
    notice_id = str(uuid4())
    @firestore.transactional
    def commit(tx):
        snap = ref.get(transaction=tx)
        if not snap.exists:
            raise HTTPException(404, '回報不存在')
        old = snap.to_dict()
        tx.update(ref, {**body.model_dump(), 'updated_at': now})
        if old.get('status') != body.status or old.get('public_reply', '') != body.public_reply:
            notice = db.collection('chiayi_notifications').document(old['owner']).collection('items').document(notice_id)
            tx.create(notice, {'title': '你的路況回報有新進度', 'report_id': str(report_id),
                'status': body.status, 'public_reply': body.public_reply, 'created_at': now,
                'expires_at': now + timedelta(days=90), 'read': False})
    try:
        commit(db.transaction())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, '回報狀態暫時無法更新') from None
    return {'ok': True}


def inbox(user, audience):
    db = services()[2]
    if audience == 'admin':
        if not is_admin(user):
            raise HTTPException(403, '只有管理員可查看通知')
        return db.collection('chiayi_admin_notifications')
    return db.collection('chiayi_notifications').document(document_id(user['uid'])).collection('items')


@router.get('/notifications')
def notifications(request: Request, response: Response, audience: Literal['user', 'admin'] = 'user', cursor: str | None = None):
    user = guard(request, response)
    from google.cloud import firestore
    collection = inbox(user, audience)
    query = collection.order_by('created_at', direction=firestore.Query.DESCENDING)
    if cursor:
        try:
            UUID(cursor)
        except ValueError:
            raise HTTPException(422, '無效分頁') from None
        snap = collection.document(cursor).get()
        if not snap.exists:
            raise HTTPException(400, '分頁已失效，請重新整理')
        query = query.start_after(snap)
    try:
        docs = list(query.limit(51).stream())
        rows = []
        for doc in docs[:50]:
            row = doc.to_dict()
            if audience == 'admin':
                receipt = doc.reference.collection('readers').document(document_id(user['uid'])).get()
                row['read'] = receipt.exists
            rows.append({'id': doc.id, **{k: row.get(k) for k in ('title','report_id','status','public_reply','created_at','read')}})
        return {'rows': rows, 'next': docs[49].id if len(docs)>50 else None}
    except Exception:
        raise HTTPException(503, '通知暫時無法讀取，請稍後再試') from None


@router.post('/notifications/{notice_id}/read')
def read_notice(notice_id: UUID, request: Request, response: Response, audience: Literal['user','admin'] = 'user'):
    user = guard(request, response)
    ref = inbox(user, audience).document(str(notice_id))
    if not ref.get().exists:
        raise HTTPException(404, '通知不存在')
    if audience == 'admin':
        ref.collection('readers').document(document_id(user['uid'])).set({'read_at': datetime.now(timezone.utc)})
    else:
        ref.update({'read': True})
    return {'ok': True}


@router.get('/my-reports')
def my_reports(request: Request, response: Response, cursor: str | None = None):
    user = guard(request, response)
    collection = services()[2].collection('chiayi_reports')
    # Equality-only query uses an automatic index. Pagination is by document ID.
    query = collection.where('owner', '==', document_id(user['uid']))
    if cursor:
        try:
            UUID(cursor)
        except ValueError:
            raise HTTPException(422, '無效分頁') from None
        snap = collection.document(cursor).get()
        if not snap.exists or snap.to_dict().get('owner') != document_id(user['uid']):
            raise HTTPException(400, '分頁已失效')
        query = query.start_after(snap)
    docs = list(query.limit(51).stream())
    rows = [{'id': d.id, **{k: d.to_dict().get(k) for k in ('category','location','note','status','public_reply','created_at','updated_at')}} for d in docs[:50]]
    return {'rows': rows, 'next': docs[49].id if len(docs)>50 else None}
