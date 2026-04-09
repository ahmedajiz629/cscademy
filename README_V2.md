# Ajiz Tech Challenge Local Environment

## Summary

This workspace contains a local multi-problem development environment for Ajiz Tech Challenge. The updated server and frontend support multiple problems, code execution, and solution submission through the existing evaluation backend.

## Verified Status

Based on the recorded logs:

- Server is running on port 3001.
- The WebSocket session connects successfully.
- The frontend loads correctly.
- The problems API returns multiple problems.
- Code run and submission flows work for the configured sample problems.

## Main Files

- `server_v2.py` for the multi-problem backend.
- `public_v2/index.html` for the browser UI.
- `public_v2/style.css` for styling.
- `public_v2/script.js` for the multi-problem frontend logic.

## Usage

Open `http://127.0.0.1:3001` in your browser, choose a problem, write a solution, run it with custom input, then submit it for evaluation.

## Notes

- The original server files remain available alongside the updated version.
- Intermittent DNS or WebSocket issues are environmental and not caused by the UI changes.
- Additional problems can be added by extending the `PROBLEMS` dictionary in `server_v2.py`.
