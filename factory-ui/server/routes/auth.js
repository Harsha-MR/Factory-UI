import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export default function makeAuthRoutes(db) {
  const users = db.collection('users');

  // Register
  router.post('/register', async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ error: 'Missing userId or password' });
    const existing = await users.findOne({ userId });
    if (existing) return res.status(409).json({ error: 'User already exists' });
    const hash = await bcrypt.hash(password, 10);
    await users.insertOne({ userId, password: hash });
    res.json({ success: true });
  });

  // Login
  router.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ error: 'Missing userId or password' });
    const user = await users.findOne({ userId });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token, userId });
  });

  // Auth middleware
  function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    const token = authHeader.split(' ')[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  }

  // Get current user
  router.get('/user', auth, (req, res) => {
    res.json({ userId: req.user.userId });
  });

  // Export auth middleware for use in main server
  router.auth = auth;

  return router;
}
