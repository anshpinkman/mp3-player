const $ = s => document.querySelector(s);
const audio = $('#audio');
let tracks = [], cur = -1, shuffle = false, repeat = 0; // repeat: 0 off, 1 all, 2 one

const fmt = s => { s = Math.floor(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const enc = encodeURIComponent;
const esc = t => t.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const note = '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const fill = (el, v) => el.style.setProperty('--p', v + '%');

async function load() {
  tracks = await (await fetch('/api/tracks')).json();
  render();
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  const ul = $('#tracks'); ul.innerHTML = '';
  tracks.forEach((t, i) => {
    if (q && !(t.title + ' ' + t.artist + ' ' + t.album).toLowerCase().includes(q)) return;
    const li = document.createElement('li');
    if (i === cur) li.className = 'active';
    li.innerHTML = `<div class="th">${t.cover ? `<img loading="lazy" src="/cover/${enc(t.file)}" alt="">` : note}</div>
      <div><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></div><time>${fmt(t.duration)}</time>`;
    li.onclick = () => play(i);
    ul.appendChild(li);
  });
  $('#empty').hidden = tracks.length > 0;
}

function play(i) {
  if (!tracks.length) return;
  cur = (i + tracks.length) % tracks.length;
  const t = tracks[cur];
  audio.src = '/audio/' + enc(t.file);
  audio.play().catch(() => {});
  $('#title').textContent = t.title;
  $('#artist').textContent = t.artist;
  $('#album').textContent = t.album;
  document.title = `${t.title} · ${t.artist}`;
  const img = $('#coverImg'), ph = document.querySelector('.cover .ph');
  if (t.cover) { img.src = '/cover/' + enc(t.file); img.hidden = false; ph.hidden = true; $('#glow').style.backgroundImage = `url(/cover/${enc(t.file)})`; }
  else { img.hidden = true; ph.hidden = false; $('#glow').style.backgroundImage = 'none'; }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album,
      artwork: t.cover ? [{ src: '/cover/' + enc(t.file) }] : []
    });
  }
  render();
  document.querySelector('#tracks li.active')?.scrollIntoView({ block: 'nearest' });
}

function next(auto) {
  if (!tracks.length) return;
  if (auto && repeat === 2) return play(cur);
  if (shuffle && tracks.length > 1) {
    let n; do { n = Math.floor(Math.random() * tracks.length); } while (n === cur);
    return play(n);
  }
  if (auto && repeat === 0 && cur === tracks.length - 1) return;
  play(cur + 1);
}
function prev() {
  if (audio.currentTime > 3) audio.currentTime = 0; else play(cur - 1);
}
function toggle() {
  if (cur < 0) return play(0);
  audio.paused ? audio.play() : audio.pause();
}

// audio events
audio.addEventListener('play', () => sync(true));
audio.addEventListener('pause', () => sync(false));
audio.addEventListener('ended', () => next(true));
audio.addEventListener('loadedmetadata', () => $('#dur').textContent = fmt(audio.duration));
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const p = audio.currentTime / audio.duration * 1000;
  if (!seeking) { $('#seek').value = p; fill($('#seek'), p / 10); }
  $('#cur').textContent = fmt(audio.currentTime);
});
function sync(playing) {
  $('#iPlay').hidden = playing; $('#iPause').hidden = !playing;
  $('#play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#cover').classList.toggle('playing', playing);
}

// seek
let seeking = false;
const seek = $('#seek');
seek.addEventListener('input', () => { seeking = true; fill(seek, seek.value / 10); $('#cur').textContent = fmt(seek.value / 1000 * audio.duration); });
seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration; seeking = false; });

// volume
const vol = $('#vol');
function setVol(v) {
  v = Math.max(0, Math.min(100, v));
  vol.value = v; audio.volume = v / 100; fill(vol, v);
  try { localStorage.setItem('vol', v); } catch (e) {}
}
vol.addEventListener('input', () => setVol(+vol.value));
let lastVol = 80;
$('#mute').onclick = () => { if (audio.volume > 0) { lastVol = +vol.value; setVol(0); } else setVol(lastVol || 80); };
try { setVol(+(localStorage.getItem('vol') ?? 80)); } catch (e) { setVol(80); }

// buttons
$('#play').onclick = toggle;
$('#next').onclick = () => next(false);
$('#prev').onclick = prev;
$('#shuffle').onclick = () => { shuffle = !shuffle; $('#shuffle').classList.toggle('on', shuffle); };
$('#repeat').onclick = () => {
  repeat = (repeat + 1) % 3;
  $('#repeat').classList.toggle('on', repeat > 0);
  $('#rep1').hidden = repeat !== 2;
};
$('#q').addEventListener('input', render);

// keyboard
document.addEventListener('keydown', e => {
  if (e.target.matches('input[type=search]')) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowRight') e.shiftKey ? next(false) : audio.currentTime += 5;
  else if (e.key === 'ArrowLeft') e.shiftKey ? prev() : audio.currentTime -= 5;
  else if (e.key === 'ArrowUp') { e.preventDefault(); setVol(+vol.value + 5); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(+vol.value - 5); }
  else if (k === 'm') $('#mute').click();
  else if (k === 's') $('#shuffle').click();
  else if (k === 'r') $('#repeat').click();
});

// media keys / lock screen
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', toggle);
  navigator.mediaSession.setActionHandler('pause', toggle);
  navigator.mediaSession.setActionHandler('nexttrack', () => next(false));
  navigator.mediaSession.setActionHandler('previoustrack', prev);
}

// upload (button + drag and drop)
async function upload(files) {
  const fd = new FormData();
  [...files].filter(f => f.name.toLowerCase().endsWith('.mp3')).forEach(f => fd.append('files', f));
  if (![...fd.keys()].length) return;
  const playing = cur >= 0 ? tracks[cur].file : null;
  await fetch('/api/upload', { method: 'POST', body: fd });
  await load();
  if (playing) cur = tracks.findIndex(t => t.file === playing);
  render();
}
$('#file').addEventListener('change', e => { upload(e.target.files); e.target.value = ''; });
let depth = 0;
addEventListener('dragenter', e => { e.preventDefault(); depth++; $('#drop').classList.add('show'); });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('#drop').classList.remove('show'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); depth = 0; $('#drop').classList.remove('show'); upload(e.dataTransfer.files); });

load();
