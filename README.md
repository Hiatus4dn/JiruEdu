# JiruEdu

JiruEdu is a role-based learning platform with dashboards for students, teachers, school administrators, and system administrators.

## Local run

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm start`
3. Open:
   `http://localhost:3000`

## Demo accounts

- School admin: `admin / admin123`
- Teacher: `teacher / teacher123`
- System admin: `sysadmin / sysadmin123`

Student accounts are created through the signup page or by the school admin dashboard.

## Core features

- Student learning dashboard with personalized subjects, quiz feedback, progress tracking, points, and badges
- Teacher dashboard for subject editing, quiz scheduling, support notes, and student performance monitoring
- School admin dashboard for user management, subject/content management, assignment review, and academic reporting
- System admin dashboard for RBAC updates, audit trail review, and database backup management

## Deployment notes

This app is deployment-ready for a generic Node/Docker host.

Important:

- Set `AUTH_SECRET` to a real random secret before deploying.
- Keep `OPEN_BROWSER=false` in production.
- Set `DATA_DIR` to a persistent writable directory for `database.db`, `uploads/`, and `backups/`.
- The health endpoint is `GET /api/health`.
- Do not scale this app to multiple instances while it uses `SQLite` and local file uploads.

## Render deployment

This repo now includes [render.yaml](<C:/Users/dean matthew/OneDrive/Documents/JIRUEDU/render.yaml>) for a Render Blueprint deploy.

What it sets up:

- Docker-based web service
- `starter` plan
- Singapore region
- persistent disk mounted at `/data`
- generated `AUTH_SECRET`
- health check at `/api/health`

To publish it:

1. Push this repo to GitHub.
2. In Render, choose `New` -> `Blueprint`.
3. Connect the GitHub repo and deploy the Blueprint.
4. Wait for the service to finish building.
5. Open the generated public `onrender.com` URL.

Important:

- Persistent disks on Render require a paid web service.
- Keep this app as a single instance because the data layer is `SQLite`.
- You can add your own custom domain later in the Render dashboard.

## Docker

Build:

`docker build -t jiruedu .`

Run:

`docker run -p 3000:3000 --env-file .env -e DATA_DIR=/data -v /your/persistent/data:/data jiruedu`

Mount persistent storage to `/data` so SQLite, uploads, and backups survive restarts.
