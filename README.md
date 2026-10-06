# NMUSA Event Temple Digital Signage POC v2

This package is the local-install version of the approved prototype iteration:

- NMUSA logo stored locally (no external image dependency)
- Black background with Army yellow accent (`#FFCC01`)
- Main **Today's Schedule** area
- Right-side **Tomorrow** preview panel
- Attendee count appears only in the **Happening Now** panel
- Lobby / All Rooms plus Room 101 / 203 / 205 preview controls
- Auto-refresh every 30 seconds
- Mock mode enabled by default
- Optional server-side Event Temple connection

## Fastest way to test

### Requirements
Install **Node.js 18 or newer**.

### Start
1. Unzip this folder somewhere on the NUC, for example `C:\NMUSA-Signage`.
2. Double-click `start-browser.bat` only after starting the server, or open Command Prompt in the folder and run:

   `npm start`

3. Browse to:

   `http://localhost:3000`

There are **no npm dependencies to install** in this version.

## Full-screen kiosk test on Windows

Double-click:

`start-signage.bat`

It starts the Node server and launches Microsoft Edge in kiosk/full-screen mode.

Press **Alt+F4** to close kiosk mode during testing.

## Room-specific test URLs

- Lobby / all rooms: `http://localhost:3000`
- Room 101: `http://localhost:3000/?room=101`
- Room 203: `http://localhost:3000/?room=203`
- Room 205: `http://localhost:3000/?room=205`

For the real Event Temple integration, replace those demo room numbers with the actual Event Temple `space_id` values.

## Mock data

`.env` currently contains:

`USE_MOCK_DATA=true`

That lets the display work immediately without Event Temple credentials. Today's and tomorrow's dates are generated dynamically so the demo continues to work on future days.

## Switching to Event Temple

Edit `.env`:

```
USE_MOCK_DATA=false
EVENT_TEMPLE_API_KEY=YOUR_KEY
EVENT_TEMPLE_ORG_ID=YOUR_ORG_ID
EVENT_TEMPLE_API_BASE=https://api.eventtemple.com
```

Restart the server after changing `.env`.

The browser never receives the API key. `server.js` makes the Event Temple request and returns only normalized event data to the signage page.

## API endpoint used by the browser

`GET /api/events?date=YYYY-MM-DD&room=SPACE_ID`

The local server then either returns mock data or proxies Event Temple `/v2/events`.

## Notes before production

1. Confirm the exact Event Temple organization event payload and attendee-count field.
2. Replace demo room IDs with actual Event Temple Space IDs.
3. Decide whether to remove the Preview toolbar for production displays.
4. Set Windows to auto-login/start the signage launcher if desired.
5. Consider caching the last successful Event Temple response for network outages.
