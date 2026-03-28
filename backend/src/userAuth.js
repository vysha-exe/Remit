import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);

const JWT_SECRET =
  process.env.JWT_SECRET || "remit-dev-local-only-set-JWT_SECRET-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function signUserToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * @param {import("express").Express} app
 * @param {{ isDatabaseConnected: () => boolean }} opts
 */
export function attachUserAuthRoutes(app, { isDatabaseConnected }) {
  app.post("/api/auth/register", async (req, res) => {
    if (!isDatabaseConnected()) {
      return res.status(503).json({
        message:
          "MongoDB is not connected. Add MONGODB_URI to your backend environment and restart the server."
      });
    }
    try {
      const name = String(req.body?.name || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Enter a valid email address." });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      }
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const doc = await User.create({ name, email, passwordHash });
      const token = signUserToken(doc._id.toString());
      return res.status(201).json({
        token,
        user: {
          id: doc._id.toString(),
          name: doc.name,
          email: doc.email,
          createdAt: doc.createdAt.toISOString()
        }
      });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }
      return res.status(500).json({ message: e.message || "Registration failed." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    if (!isDatabaseConnected()) {
      return res.status(503).json({
        message:
          "MongoDB is not connected. Add MONGODB_URI to your backend environment and restart the server."
      });
    }
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password." });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ message: "Invalid email or password." });
      }
      const token = signUserToken(user._id.toString());
      return res.json({
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString()
        }
      });
    } catch (e) {
      return res.status(500).json({ message: e.message || "Login failed." });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!isDatabaseConnected()) {
      return res.status(503).json({
        message: "MongoDB is not connected."
      });
    }
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return res.status(401).json({ message: "Not signed in." });
    }
    const payload = verifyJwt(m[1]);
    if (!payload?.sub) {
      return res.status(401).json({ message: "Invalid or expired session." });
    }
    const user = await User.findById(payload.sub).lean();
    if (!user) {
      return res.status(401).json({ message: "Account not found." });
    }
    return res.json({
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString()
      }
    });
  });
}
