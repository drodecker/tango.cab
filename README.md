# Tango.Cab

The public website and lead-capture service for [tango.cab](https://tango.cab).

This release is the major rebrand of OC.Cab into Tango.Cab, expanding the story from a single Orange County deployment to a multi-market RoboTaxi fleet, depot, investor, and property-partner platform. OC.Cab remains represented as the committed Orange County, CA investment operation.

## What is included

- Multi-page static website for Tango.Cab
- Interactive Mapbox view of RoboTaxi networks and Tango operations
- Separate investor, property-partner, and leadership-career forms
- Server-side NocoDB lead submission endpoint
- Docker image and Compose configuration for self-hosting

## Run locally with Docker

1. Copy `.env.example` to `.env` and fill in the NocoDB URL, API key, and table IDs.
2. Ensure the external `npm_network` Docker network exists, or adjust `docker-compose.yml` for your environment.
3. Start the site:

   ```bash
   docker compose up -d --build
   ```

The site listens on `127.0.0.1:3010` and is intended to sit behind a TLS reverse proxy.

## Project layout

- `site/` — HTML pages, imagery, client configuration, and map data
- `server.mjs` — static-file server and `/submit` NocoDB proxy
- `Dockerfile` — production image
- `docker-compose.yml` — local production deployment

## Configuration

Secrets belong only in `.env`; the file is ignored by Git. The Mapbox token in `site/config.js` is a browser-safe public token. Do not place a Mapbox secret token or NocoDB API key in client-side files.
