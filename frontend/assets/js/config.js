// config.js
export const API_BASE = 
  location.hostname.includes("localhost")
    ? "http://localhost:5000"
    : "https://sell4life-backend.onrender.com";

