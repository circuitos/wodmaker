# Setup Walkthrough

How to get this project running locally and hosted on GitHub Pages, with a live preview of every branch.

## 1. Run it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/circuitos/wodmaker.git
cd wodmaker
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Edits to `src/App.jsx` reload in the browser as you save.

To check the real production output rather than the dev server:

```bash
npm run build      # writes dist/
npm run preview    # serves dist/ on :4173
```

## 2. Turn on GitHub Pages

The project ships a deploy workflow (`.github/workflows/deploy-pages.yml`) that runs on every push. It builds a `gh-pages` branch containing your default branch's site at the root and a build of every other branch under `previews/`. Pages should serve that branch:

1. Push the project first; within a couple of minutes the workflow creates the `gh-pages` branch. Watch it under the **Actions** tab.
2. On your repo's main page, click **Settings**.
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment**, **Source**, choose **Deploy from a branch**.
5. **Branch**: `gh-pages`, folder: `/ (root)`. Click **Save**.
6. Wait 30 to 60 seconds and refresh. At the top of the Pages settings you'll see: *"Your site is live at `https://YOUR-USERNAME.github.io/wodmaker/`"*.

That's your public URL. It updates automatically every time you push to your default branch.

Nothing in the repo needs editing for a fork: the workflow reads the repo name and default branch from the event payload and passes them to the build, so a fork under a different name gets the right asset paths without a config change.

### Branch previews

Every branch you push gets its own build at
`https://YOUR-USERNAME.github.io/wodmaker/previews/BRANCH-NAME/`,
and `https://YOUR-USERNAME.github.io/wodmaker/previews/` lists them all with their latest commit. Deleting a branch removes its preview on the next deploy. If a branch has an open pull request, the workflow keeps a sticky comment on it with the preview link.

The `gh-pages` branch is generated output. Never edit it by hand and never branch from it; every deploy force-pushes over it.

### Dry-running the deploy locally

```bash
git fetch origin
npm run build:site       # composes the whole site into _site/
npx serve _site          # or any static server
```

This is the same script CI runs. It builds every remote branch, so the first run takes a while.

## 3. Why each branch is built separately

Vite bakes the serving path into every asset URL at build time. A build made for the site root requests `/wodmaker/assets/index-abc123.js`; served from `/wodmaker/previews/my-branch/` that request 404s and the page comes up blank. So the composition script builds each tree with its own `--base` rather than building once and copying.

Installs are shared between branches whose `package-lock.json` is byte-identical, which is the normal case, so a push usually costs one `npm ci` no matter how many branches exist. A branch that changes dependencies gets its own install.

A branch that fails to build is logged and skipped, and it drops off the preview index until it builds again. The rest of the deploy goes out normally. If the *default* branch fails to build, the whole run fails and the live site keeps serving the previous deploy, so a red Actions run means the site is stale rather than broken.

## 4. Troubleshooting

**The site is a blank page and the console shows 404s on JS files.**
The base path is wrong. Check the `SITE_BASE` value in the deploy workflow's log line; it should be `/<repo-name>/`.

**A push deployed but the browser still shows the old version.**
GitHub Pages caches `index.html` at the edge for about 10 minutes. Asset files are content-hashed so they never go stale, but the document that points at them can. Hard-refresh, or wait it out.

**The workflow ran green but Pages shows a 404.**
Pages source is probably still set to the default branch rather than `gh-pages`. Recheck step 2.

**A preview URL 404s.**
Either the branch build failed (check the Actions log for a `SKIPPED` line) or the branch name in the URL is wrong. Branch names with slashes become nested paths: `claude/my-work` lives at `/previews/claude/my-work/`.

## 5. Keeping previews out of search

`public/robots.txt` tells crawlers to skip `/previews/`, so search engines index the real site and not a dozen near-identical copies of it. The preview index page also carries a `noindex` meta tag.
