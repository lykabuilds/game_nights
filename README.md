# 🎲 Game Night Rulebook

Interactive, searchable rules for **Harmonies**, **Tiny Epic Dungeons** and **Century: Golem Edition**, plus a live game-night companion.

**Live site:** https://lykabuilds.github.io/game_nights/

- 📖 A guide page for each game: setup checklists, turn walkthroughs, rules detail and score calculators
- 🔎 Site-wide search with synonyms ("mana" finds Focus, "points" finds scoring). Press `/` to search.
- 🔗 Deep links to any rule or turn step, e.g. `harmonies/#h-trees-green-on-brown` or `harmonies/#h-turn--3`
- 📱 Game Night: QR sharing, quick players, 4-letter room codes, live scores and a leaderboard. No sign-up.
- ❤️ Live player trackers per game: Health/Focus and a party Torch/Goblin panel (Tiny Epic Dungeons), crystals, caravan limit and auto-scoring (Century), card limit, cubes and end trigger (Harmonies)

**Stack:** static HTML/CSS/vanilla JS on GitHub Pages (no build step needed to deploy), with Firebase Anonymous Auth and Cloud Firestore for real-time data.

---

## Project structure
```
index.html                 Home page (links to every guide)
harmonies/index.html       Harmonies guide
tiny-epic-dungeons/        Tiny Epic Dungeons guide
century-golem/             Century: Golem Edition guide
game-night/                Rooms, players, live scores, leaderboard
assets/
  styles.css               All styles (themes per game via body[data-game])
  app.js                   Shared behavior: search, checklists, steppers, deep links, calculators
  search-index.js          Search data: every rule, section and turn step
  game-night.js            QR codes, players, rooms, leaderboard
  firebase.js              Firebase adapter (anonymous sign-in + Firestore)
  og/*.png                 Link-preview images (1200×630)
firebase-config.js         Your Firebase web settings (edit this)
firestore.rules            Database security rules (paste into Firebase)
sitemap.xml, robots.txt    For search engines
404.html                   Friendly not-found page
```

## Setup (about 20 minutes)

### 1. Firebase
1. <https://console.firebase.google.com> → **Create a project** (Analytics optional).
2. **Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Firestore Database → Create database** → location `asia-southeast1 (Singapore)` → **production mode**.
4. Firestore **Rules** tab → paste [`firestore.rules`](firestore.rules) → **Publish**.
5. **Project settings ⚙️ → Your apps → Web `</>`** → register an app → copy the config into [`firebase-config.js`](firebase-config.js). These values are not secret.

### 2. GitHub Pages
1. The files live in the public repo [`lykabuilds/game_nights`](https://github.com/lykabuilds/game_nights) on `main`.
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. In Firebase: **Authentication → Settings → Authorized domains → Add** `lykabuilds.github.io`.

> Using a different repo name or username? Find and replace `https://lykabuilds.github.io/game_nights/` in the HTML files, `sitemap.xml` and `robots.txt`, and `/game_nights/` in `404.html`.

### 3. Get indexed by Google
1. Go to [Google Search Console](https://search.google.com/search-console) → **Add property → URL prefix** → `https://lykabuilds.github.io/game_nights/`.
2. Verify with the **HTML tag** method: paste the `<meta name="google-site-verification" …>` tag into the `<head>` of `index.html`, push, then click Verify.
3. **Sitemaps** → submit `sitemap.xml`.
4. **URL Inspection** → paste each guide URL → **Request indexing** to speed things up.
5. Optional: do the same in [Bing Webmaster Tools](https://www.bing.com/webmasters), which can import from Search Console.

New sites usually take days to a few weeks to appear. Sharing the links (Reddit board-game threads, BoardGameGeek forums, your LinkedIn) helps Google find and trust them sooner.

## SEO built in
- One page per game, each with its own title, meta description, canonical URL and a single `h1`
- Open Graph and Twitter cards with preview images, for nice links in Messenger, Discord and Slack
- JSON-LD structured data: `WebSite` and `ItemList` (home), `Article` with `about: Game` (guides), `WebApplication` (Game Night), and `BreadcrumbList`
- All rules are in the HTML itself, not loaded by JavaScript, so crawlers see everything
- `sitemap.xml`, `robots.txt`, semantic landmarks, skip link, internal "Popular questions" links

## Run locally
```bash
python3 -m http.server 8000   # open http://localhost:8000
```

## Editing rules
Rules live directly in each guide's `index.html` (inside `<details>` blocks). If you add or rename a rule, also add or update its entry in `assets/search-index.js` (fields: `g` game, `u` page, `a` anchor id, `t` title, `s` section, `x` text) so search can find it.

## Ideas for v2
- Google sign-in so players follow you across devices
- Auto-clean old rooms (Firestore TTL policy on `rooms.createdAt`)
- More games, with a page each for SEO

---
Unofficial fan guide. Rules are summarized in plain language. Always check each game's official rulebook. Game names are trademarks of their publishers.
