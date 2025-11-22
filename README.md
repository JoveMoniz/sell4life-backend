# Sell4Life Core (Parallel Stack)
Starter for building Sell4Life outside Elementor/WordPress.
- backend/ : Node.js Express API that can read from Woo Store API for now.
- frontend/ : static HTML/CSS/JS that can call the backend.

## Backend (dev)
1. Install Node 18+
2. cd backend
3. npm install
4. Set env (optional): WOO_URL, WOO_CONSUMER_KEY, WOO_CONSUMER_SECRET
5. npm run dev
API: http://localhost:4000/api/health

## Frontend (dev)
Open frontend/index.html in a local server (e.g., VS Code Live Server),
it will call backend on port 4000.
