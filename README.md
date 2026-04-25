# JumysTap

Go web service that serves both the API and the static frontend from one Render web service.

## Render deploy

1. Push the repo to GitHub/GitLab.
2. In Render, create a new Blueprint from this repository.
3. Render will read `render.yaml` and create:
   - `jumystap-web`
   - `jumystap-db`
4. Set `TELEGRAM_BOT_TOKEN` during Blueprint creation if you need Telegram registration/login.

## Notes

- The app now supports `DATABASE_URL` and `PORT`, which Render provides.
- SQL migrations from `internal/migration/*.sql` run automatically on startup.
- If `TELEGRAM_BOT_TOKEN` is empty, the site still starts, but Telegram-based auth flows return `503`.
