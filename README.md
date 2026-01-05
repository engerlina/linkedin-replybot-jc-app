# LinkedIn Automation System

Two interconnected automation systems leveraging LinkedAPI.io for LinkedIn engagement:

1. **Reply Bot** - Keyword-triggered comment reply + DM sales funnel
2. **Comment Bot** - Intelligent engagement on watched accounts' posts

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **API Backend** | FastAPI (Python) | Core automation logic, LinkedAPI orchestration, scheduling |
| **Admin Dashboard** | Next.js | Control panel, monitoring, configuration |
| **Database** | PostgreSQL | State management, lead tracking, job queue |
| **ORM** | Prisma | Type-safe database access (both Python + JS) |
| **AI/LLM** | Claude API (Anthropic) | Comment generation, sales message personalization |
| **Scheduler** | APScheduler | Built-in cron jobs (no Redis needed) |
| **Hosting** | Railway | FastAPI + Next.js + PostgreSQL |

## Quick Start

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/linkedin-replybot-jc-app.git
cd linkedin-replybot-jc-app
```

2. Set up environment variables:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your API keys
```

3. Start with Docker Compose:
```bash
docker-compose up -d
```

4. Run database migrations:
```bash
docker-compose exec backend prisma migrate dev
```

5. Open browser:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000/docs

## Railway Deployment

### Prerequisites
- Railway account
- GitHub repository connected to Railway

### Steps

1. Create a new Railway project

2. Add PostgreSQL service:
   - Click "New Service" > "Database" > "PostgreSQL"

3. Deploy Backend:
   - Click "New Service" > "GitHub Repo"
   - Select this repository
   - Set root directory to `backend`
   - Add environment variables:
     - `DATABASE_URL` (use Railway's PostgreSQL connection string)
     - `LINKEDAPI_API_KEY`
     - `ANTHROPIC_API_KEY`
     - `ADMIN_PASSWORD`
     - `JWT_SECRET`
     - `FRONTEND_URL` (will be set after frontend deployment)

4. Deploy Frontend:
   - Click "New Service" > "GitHub Repo"
   - Select this repository
   - Set root directory to `frontend`
   - Add environment variables:
     - `NEXT_PUBLIC_API_URL` (Backend URL from step 3)

5. Update Backend's `FRONTEND_URL` with the Frontend URL

## Environment Variables

### Backend
```env
DATABASE_URL=postgresql://user:pass@host:5432/linkedin_automation
LINKEDAPI_API_KEY=your_linkedapi_key
ANTHROPIC_API_KEY=your_anthropic_key
ADMIN_PASSWORD=your_secure_password
JWT_SECRET=your_jwt_secret
FRONTEND_URL=https://your-frontend.railway.app
```

### Frontend
```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

## Features

### Reply Bot
- Monitor specific LinkedIn posts for keyword triggers
- Automatically reply to matching comments with AI-generated responses
- Send connection requests to non-connected commenters
- Send personalized DMs with CTAs to connected leads

### Comment Bot
- Watch specific LinkedIn accounts for new posts
- Automatically engage with posts using AI-generated insightful comments
- React to posts before commenting

### Lead Management
- Track all leads captured from keyword matches
- Monitor connection status and DM delivery
- Export lead data

### Rate Limiting
- Configurable daily limits for comments, connections, and messages
- Human-like random delays between actions
- Per-account tracking

## License

MIT
