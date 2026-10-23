import os, io, json, mimetypes, tempfile
import requests
from flask import Flask, render_template, jsonify, request, send_file, abort
from mutagen.mp3 import MP3
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
SUPABASE_BUCKET = os.environ.get('SUPABASE_BUCKET', 'music')

def configured():
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)

def headers(extra=None):
    h = {'apikey': SUPABASE_SERVICE_KEY, 'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}'}
    if extra: h.update(extra)
    return h

def storage_url(path=''):
    return f"{SUPABASE_URL}/storage/v1/object/{path}" if path else f"{SUPABASE_URL}/storage/v1/object"

def list_objects():
    if not configured(): return []
    r = requests.post(f'{SUPABASE_URL}/storage/v1/object/list/{SUPABASE_BUCKET}', headers=headers({'Content-Type':'application/json'}), json={'prefix':'','limit':1000,'offset':0,'sortBy':{'column':'name','order':'asc'}}, timeout=30)
    r.raise_for_status()
    return r.json()

def public_url(name):
    from urllib.parse import quote
    return f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{quote(name)}"

def metadata_from_bytes(name, data):
    result = {'file': name, 'title': os.path.splitext(name)[0], 'artist':'Unknown artist','album':'','duration':0,'cover':False}
    with tempfile.NamedTemporaryFile(suffix='.mp3') as f:
        f.write(data); f.flush()
        try:
            audio = MP3(f.name)
            result['duration'] = audio.info.length
            tags = audio.tags
            if tags:
                if tags.get('TIT2'): result['title'] = str(tags['TIT2'])
                if tags.get('TPE1'): result['artist'] = str(tags['TPE1'])
                if tags.get('TALB'): result['album'] = str(tags['TALB'])
                result['cover'] = bool(tags.getall('APIC'))
        except Exception: pass
    return result

@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/tracks')
def tracks():
    if not configured(): return jsonify({'error':'Storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY in Render environment variables.'}), 503
    try: objects = list_objects()
    except Exception as e: return jsonify({'error':f'Could not list storage: {e}'}), 502
    out=[]
    for obj in objects:
        name=obj.get('name','')
        if not name.lower().endswith('.mp3'): continue
        meta_name=name+'.json'
        meta={'file':name,'title':os.path.splitext(name)[0],'artist':'Unknown artist','album':'','duration':0,'cover':False}
        try:
            rr=requests.get(public_url(meta_name), timeout=15)
            if rr.ok: meta.update(rr.json())
        except Exception: pass
        meta['file']=name; out.append(meta)
    return jsonify(out)

@app.route('/audio/<path:name>')
def audio(name):
    if not configured(): abort(503)
    r=requests.get(public_url(name), stream=True, timeout=30)
    if r.status_code != 200: abort(r.status_code)
    return send_file(io.BytesIO(r.content), mimetype='audio/mpeg', download_name=os.path.basename(name), conditional=True)

@app.route('/cover/<path:name>')
def cover(name):
    if not configured(): abort(503)
    try:
        r=requests.get(public_url(name+'.cover'), timeout=20)
        if r.ok: return send_file(io.BytesIO(r.content), mimetype=r.headers.get('Content-Type','image/jpeg'))
    except Exception: pass
    abort(404)

@app.route('/api/upload', methods=['POST'])
def upload():
    if not configured(): return jsonify({'error':'Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY on Render.'}), 503
    saved=0; errors=[]
    for f in request.files.getlist('files'):
        name=secure_filename(f.filename or '')
        if not name.lower().endswith('.mp3'): continue
        data=f.read()
        meta=metadata_from_bytes(name,data)
        try:
            up=requests.post(storage_url(f'{SUPABASE_BUCKET}/{name}'), headers=headers({'Content-Type':'audio/mpeg','x-upsert':'true'}), data=data, timeout=90)
            up.raise_for_status()
            side=json.dumps(meta).encode()
            mr=requests.post(storage_url(f'{SUPABASE_BUCKET}/{name}.json'), headers=headers({'Content-Type':'application/json','x-upsert':'true'}), data=side, timeout=30)
            mr.raise_for_status()
            # Preserve embedded cover art separately for the public cover endpoint.
            with tempfile.NamedTemporaryFile(suffix='.mp3') as tf:
                tf.write(data); tf.flush()
                try:
                    tags=MP3(tf.name).tags
                    pics=tags.getall('APIC') if tags else []
                    if pics:
                        cr=requests.post(storage_url(f'{SUPABASE_BUCKET}/{name}.cover'), headers=headers({'Content-Type':pics[0].mime or 'image/jpeg','x-upsert':'true'}), data=pics[0].data, timeout=30)
                        cr.raise_for_status()
                except Exception: pass
            saved+=1
        except Exception as e: errors.append(f'{name}: {e}')
    return jsonify({'saved':saved,'errors':errors}), (207 if errors else 200)

@app.route('/api/delete/<path:name>', methods=['DELETE'])
def delete_track(name):
    if not configured(): return jsonify({'error':'Storage is not configured'}),503
    safe=secure_filename(name)
    if not safe.lower().endswith('.mp3'): return jsonify({'error':'Invalid filename'}),400
    r=requests.delete(f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}', headers=headers({'Content-Type':'application/json'}), json={'prefix':'','objects':[safe,safe+'.json',safe+'.cover']}, timeout=30)
    if not r.ok: return jsonify({'error':r.text}),502
    return jsonify({'deleted':True})

if __name__ == '__main__': app.run(host='0.0.0.0', port=int(os.environ.get('PORT',5000)))
