# HCV ValueMaX — Web App

A browser version of the HCV ValueMaX Android app. Same three calculators
(FE MaX, Revenue MaX, BRT), same formulas, same branded PDF/image sharing.
It runs entirely in the browser — **no server, no backend, no internet needed
after the first load.**

## Files

| File | What it is |
|------|-----------|
| `index.html` | The app shell (open this to run the app) |
| `app.js` | All logic, screens, calculators, PDF generation |
| `assets.js` | Brand images (lockup + PDF banners), embedded |
| `manifest.json`, `sw.js` | Make it installable + work offline (PWA) |
| `icon-192.png`, `icon-512.png` | App icons |

## How your data is stored (important)

On the phone app, saved estimates live in the phone's local storage. In the
browser, this app does the same thing using **`localStorage`**:

- Saved estimates and your in-progress drafts are stored **on the device/browser
  you're using** — they never leave it, and there is no server.
- They **persist** after you close the tab or go offline.
- They are **per-browser and per-device**: estimates saved on your phone's Chrome
  will not appear on your laptop, or in a different browser. (This matches how the
  Android app keeps data on that one phone.)
- Clearing browser data / site data will erase saved estimates. If a rep needs a
  permanent copy, they should **share/download the PDF** — that's the durable record.

Because everything is local, the app works fully offline once loaded — ideal for
a dealer showing a customer on-site with no signal.

## Run it locally (to try it out)

Because browsers restrict some features on `file://`, run a tiny local server:

```bash
cd webapp
python3 -m http.server 8000
```

Then open <http://localhost:8000> . (Opening `index.html` directly mostly works
too, but the offline/installable features and image-share need `http(s)`.)

---

## Host it online for FREE — pick any one

All of these give you a public `https://…` link, which is what you want so the
PDF/image "Share" button and the "Add to Home screen" install both work.

### Option A — Netlify Drop (easiest, ~1 minute, no account needed to try)
1. Go to <https://app.netlify.com/drop>
2. Drag the **whole `webapp` folder** onto the page.
3. It uploads and gives you a live link like `https://random-name.netlify.app`.
4. (Optional) Make a free account to keep it and rename it.

### Option B — GitHub Pages (best if you want a stable, updatable link)
1. Create a free account at <https://github.com>.
2. Create a new repository, e.g. `hcv-valuemax`.
3. Upload all the files from the `webapp` folder (Add file → Upload files → drag them in → Commit).
4. Go to the repo's **Settings → Pages**.
5. Under "Build and deployment", set **Source = Deploy from a branch**, **Branch = main / (root)**, Save.
6. After a minute your app is live at `https://<your-username>.github.io/hcv-valuemax/`

### Option C — Cloudflare Pages
1. Free account at <https://pages.cloudflare.com>.
2. "Create a project" → "Upload assets" (direct upload, no Git needed).
3. Upload the `webapp` files → Deploy. You get a `https://<name>.pages.dev` link.

### Option D — Vercel
1. Free account at <https://vercel.com>.
2. "Add New → Project" → drag the folder in (or connect a GitHub repo).
3. Deploy → you get a `https://<name>.vercel.app` link.

---

## Installing it "like an app" on a phone

Once it's hosted on an `https://` link, open that link on the phone and:

- **Android (Chrome):** menu (⋮) → **Add to Home screen** → it installs with the
  HCV ValueMaX icon and opens full-screen, offline-capable.
- **iPhone (Safari):** Share button → **Add to Home Screen**.

## Notes

- The app loads two small libraries from a CDN (jsPDF for PDF creation, pdf.js for
  the image preview). After the first successful online load, the service worker
  caches them so the app keeps working offline.
- All calculations mirror the Android app's logic exactly, and were verified to
  produce identical numbers (e.g. FE MaX at 10,000 km/mo, 3.1 km/l, ₹100/l, 7% →
  ₹2.53 Lakh/year).
