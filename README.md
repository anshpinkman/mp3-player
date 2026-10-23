# Midnight MP3 Player (Flask + Render + Supabase Storage)

## Features
- Midnight dark responsive player
- Song search by title, artist and album
- MP3 upload with metadata extraction (title, artist, album, duration, embedded cover)
- Favourites and playlists saved in the browser's localStorage
- Song files and metadata stored in Supabase Storage, not Render's temporary filesystem
- Shuffle, repeat, seeking, volume and keyboard shortcuts

## Deploy on Render
Build command: `pip install -r requirements.txt`
Start command: `gunicorn app:app`
Runtime: Python 3

## Configure persistent song storage
1. Create a Supabase project at https://supabase.com/.
2. In Storage, create a bucket named `music` and make it **public** (the app uses public URLs for audio/cover retrieval).
3. In Supabase Project Settings -> API, copy the Project URL and the **service_role** key. Keep the service_role key secret; never put it in frontend JavaScript or commit it to GitHub.
4. In Render -> your service -> Environment, add:
   - `SUPABASE_URL` = your project URL
   - `SUPABASE_SERVICE_KEY` = your service_role key
   - `SUPABASE_BUCKET` = `music`
5. Save changes and redeploy.

The backend stores MP3s plus JSON metadata and embedded cover images in the bucket. Do not upload copyrighted music unless you have permission to use it.

## Playlists and favourites
These are stored in browser localStorage. They persist in that browser, but are not synced between devices/accounts. Songs themselves persist in Supabase Storage.
