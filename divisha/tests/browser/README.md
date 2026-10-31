# Browser walkthrough

Runs the real app in a headless browser with a stand-in for claude.ai
(`fake-claude.js`: in-memory storage, a viewer, and a canned Claude reply).
It sends a fever message, edits and saves the card, then edits, removes and
adds entries in Look back, and checks phone width, dark mode and the
"Claude isn't available" state. Screenshots go in `shots/`.

```bash
cd divisha/tests/browser
./build.sh                                   # makes preview/
(cd preview && python3 -m http.server 8765 --bind 127.0.0.1 &)
mkdir -p shots && node run.mjs .             # PASS/FAIL lines, then console errors
```

Set `PLAYWRIGHT` to Playwright's `index.js` path and `CHROMIUM` to a browser
binary if they aren't found on their own. Add `?seed=1` to the preview URL to
see the app with a few weeks of example entries.

PDFs are drawn with PDF.js from cdnjs. Without internet access, download
`pdf.min.js` and `pdf.worker.min.js` (version 3.11.174) into a folder and set
`PDFJS_DIR` to it.
