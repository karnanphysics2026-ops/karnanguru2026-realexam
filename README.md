# KARNAN GURU — NEET Mock Tests & Real Exam

A focused NEET UG practice platform: two mock tests and a full real-exam
simulator. Nothing else competes for the student's attention.

**Mantra:** Practice makes man perfect. Come with aspiration, go with
confidence — and achieve your dream to become a doctor.

## File Structure

```
karnan/
├── index.html          ← Single-page app: landing, home, auth, exam, result screens
├── css/
│   └── styles.css      ← All CSS (design tokens, components, layouts)
├── js/
│   └── simple-neet.js  ← App logic: auth, question loading, exam engine, results
├── assets/
│   └── logo.png
├── data/, source/       ← Question bank source files used by the Supabase import pipeline
└── scripts/             ← Python scripts that build/import the question bank into Supabase
```

## Editing Guide

| What you want to change | Edit this file |
|---|---|
| Colors, fonts, spacing | `css/styles.css` |
| Copy / mantra / screen layout | `index.html` |
| Supabase URL / anon key | `js/simple-neet.js` (top of file) |
| Exam rules (question counts, marking, timer) | `js/simple-neet.js` → `EXAM` constant |
| Mock test list | `js/simple-neet.js` → `MOCKS` constant |
| Auth, exam engine, scoring, results | `js/simple-neet.js` |
| Question bank content | `data/`, `source/`, `scripts/build_questions.py`, `scripts/import_to_supabase.py` |

## How it works

- Students sign in (Supabase auth) and see two mock tests plus one real exam
  simulator on the home screen. Free accounts see the tests locked; paid
  accounts (`plan` = premium/paid/pro/unlimited on `user_profiles`) can start
  them.
- Each test pulls active English/12th questions from Supabase
  (Physics 45 · Chemistry 45 · Biology 90 = 180 questions), seeded so the
  same mock always draws the same set.
- The exam screen replicates real NEET navigation: question palette, mark
  for review, timer, auto-submit on time-out.
- Results are scored `+4` correct / `−1` wrong and saved to
  `exam_attempts` when signed in.

## Serving

This project must be served from a web server (not opened directly as a
file) because it uses Supabase's browser client. Use any of:
- `npx serve .`
- `python3 -m http.server 8080`
- Deploy to any static host (Netlify, Vercel, GitHub Pages, etc.) — this
  repo already deploys to GitHub Pages on push to `main`.
