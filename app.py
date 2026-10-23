import os, io
from flask import Flask, render_template, jsonify, send_from_directory, request, send_file, abort
from mutagen.mp3 import MP3
from werkzeug.utils import secure_filename

BASE = os.path.dirname(os.path.abspath(__file__))
MUSIC = os.path.join(BASE, "music")
os.makedirs(MUSIC, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500 MB per upload


def read_track(fn):
    """Read title, artist, album, duration and cover flag from an MP3 file."""
    path = os.path.join(MUSIC, fn)
    info = {"file": fn, "title": os.path.splitext(fn)[0], "artist": "Unknown artist",
            "album": "", "duration": 0, "cover": False}
    try:
        audio = MP3(path)
        info["duration"] = audio.info.length
        tags = audio.tags
        if tags:
            if "TIT2" in tags: info["title"] = str(tags["TIT2"])
            if "TPE1" in tags: info["artist"] = str(tags["TPE1"])
            if "TALB" in tags: info["album"] = str(tags["TALB"])
            info["cover"] = bool(tags.getall("APIC"))
    except Exception:
        pass
    return info


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tracks")
def tracks():
    files = sorted(f for f in os.listdir(MUSIC) if f.lower().endswith(".mp3"))
    return jsonify([read_track(f) for f in files])


@app.route("/audio/<path:fn>")
def audio(fn):
    return send_from_directory(MUSIC, fn, conditional=True)  # supports seeking


@app.route("/cover/<path:fn>")
def cover(fn):
    path = os.path.join(MUSIC, os.path.basename(fn))
    try:
        pics = MP3(path).tags.getall("APIC")
        if pics:
            return send_file(io.BytesIO(pics[0].data), mimetype=pics[0].mime or "image/jpeg",
                             max_age=86400)
    except Exception:
        pass
    abort(404)


@app.route("/api/upload", methods=["POST"])
def upload():
    saved = 0
    for f in request.files.getlist("files"):
        name = secure_filename(f.filename or "")
        if name.lower().endswith(".mp3"):
            f.save(os.path.join(MUSIC, name))
            saved += 1
    return jsonify({"saved": saved})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
