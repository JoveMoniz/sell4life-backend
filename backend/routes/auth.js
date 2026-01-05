import authMiddleware from "../middleware/authMiddleware.js";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import express from "express";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "../data/user.json");
const SECRET = "sell4life-secret-key";

function loadUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// REGISTER
router.post("/register", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
    return res.status(400).json({ ok: false, msg: "Missing fields" });
}


    const users = loadUsers();

    if (users.find(u => u.email === email)) {
    return res.status(409).json({ ok: false, msg: "Email already exists" });
}


    const hashed = await bcrypt.hash(password, 10);

    users.push({
        id: Date.now(),
        email,
        password: hashed
    });

    saveUsers(users);
    res.json({ ok: true, msg: "Account created" });
});

// LOGIN
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const users = loadUsers();
    const user = users.find(u => u.email === email);

    if (!user) {
    return res.status(401).json({ ok: false, msg: "Invalid credentials" });
}


    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
    return res.status(401).json({ ok: false, msg: "Invalid credentials" });
}


    const token = jwt.sign(
        { id: user.id, email: user.email },
        SECRET,
        { expiresIn: "3d" }
    );

    res.json({
  ok: true,
  token,
  user: {
    id: user.id,
    email: user.email
  }
});

});

// ME (protected)
router.get("/me", authMiddleware, (req, res) => {
    res.json({
        ok: true,
        user: {
            id: req.user.id,
            email: req.user.email
        }
    });
});

export default router;
