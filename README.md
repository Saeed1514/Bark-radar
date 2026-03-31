# Radar Viewer

A static weather radar viewer built with plain HTML, CSS, and JavaScript. It loads radar timestamps from your API, displays the newest radar image on a Leaflet map, and supports frame navigation, looping animation, opacity control, and automatic timestamp refresh.

## Features

- Loads available radar timestamps from the API with `fetch()`
- Automatically starts on the newest available radar frame
- Displays the radar image as a Leaflet `imageOverlay` using the exact bounds:
  - `[[14, 49], [28, 61]]`
- Timestamp selector for jumping to any available frame
- `Latest`, `Previous`, `Play`, `Pause`, and `Next` controls
- Adjustable animation speed
- Adjustable radar overlay opacity
- Auto-refreshes timestamps every 5 minutes
- Uses cache-busting on image requests so the newest image is always fetched
- Dark, workstation-friendly layout that works well on desktop and in tiled window managers
- Loading and error states in the status bar
- Static-site friendly and ready for GitHub Pages

## Project Structure

- `index.html` - page structure and control layout
- `style.css` - dark theme styling and responsive layout
- `script.js` - API requests, Leaflet map setup, radar overlay logic, animation, and refresh handling
- `README.md` - project documentation

## Setup

1. Put these files in your project folder.
2. No build step is required.
3. Open the project locally in a simple static server or deploy it directly to GitHub Pages.

## How to Run Locally

Because this is a static site, you can run it with any simple local web server.

### Option 1: Python

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Option 2: VS Code Live Server

1. Open the project folder in VS Code.
2. Install the Live Server extension if needed.
3. Right-click `index.html`.
4. Choose `Open with Live Server`.

## GitHub Pages Deployment

This project is designed to run as a static GitHub Pages site.

1. Create a GitHub repository and push these files.
2. In GitHub, open the repository `Settings`.
3. Go to `Pages`.
4. Under `Build and deployment`, set:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
5. Save the settings.
6. Wait for GitHub Pages to publish the site.

Your site will usually be available at:

```text
https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/
```

## API Key Note

The API key is stored in one place only:

- `script.js`
- Constant name: `API_KEY`

If the API key changes, update only that one constant at the top of `script.js`.

## Where the API Key Is Used

The key is appended when building:

- The timestamps request URL
- The radar image request URL

Both URLs are built from constants near the top of `script.js`, which keeps the project easy to edit for beginners.

## Notes

- The radar image requests include a cache-busting query parameter using `Date.now()` so the newest frame is not served from browser cache.
- The app refreshes the timestamp list every 5 minutes without forcing the user away from the currently selected frame.
- If newer frames appear after refresh, the `Latest` button lets you jump to them immediately.
