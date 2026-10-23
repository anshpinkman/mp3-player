
async function upload(files) {
  const selected = [...files].filter(f =>
    f.name.toLowerCase().endsWith('.mp3')
  );

  if (!selected.length) {
    alert('Please select MP3 files.');
    return;
  }

  const playing = cur >= 0 ? tracks[cur]?.file : null;
  const status = $('#status');
  status.hidden = false;
  status.textContent = `Uploading ${selected.length} MP3 file(s)…`;

  try {
    const fd = new FormData();
    selected.forEach(file => fd.append('files', file));

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: fd
    });

    const text = await res.text();
    let result;

    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned HTML instead of JSON (HTTP ${res.status}). ` +
        `Files may be too large or the server may have failed.`
      );
    }

    if (!res.ok && res.status !== 207) {
      throw new Error(result.error || `Upload failed (HTTP ${res.status})`);
    }

    await load();

    if (playing) {
      cur = tracks.findIndex(t => t.file === playing);
    }

    render();

    status.hidden = false;
    status.textContent =
      `Uploaded ${result.saved || 0} of ${selected.length} song(s).` +
      (result.errors?.length
        ? ' Errors: ' + result.errors.join('; ')
        : '');
  } catch (e) {
    status.hidden = false;
    status.textContent = 'Upload failed: ' + e.message;
  }
}
