import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { findUserByEmail, findUserById, verifyPassword, sanitizeUser } from '../services/authService';
import { generateToken, authenticateToken } from '../middleware/auth';
import { loginLimiter } from '../app';

const router = Router();

// A pre-computed dummy hash used to make the "email not found" path take the
// same ~100ms as the "email found, wrong password" path, preventing timing
// attacks that would let an attacker enumerate valid email addresses.
const DUMMY_HASH = bcrypt.hashSync('dummy-timing-guard', 10);

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = findUserByEmail(email);
  if (!user) {
    // Run a dummy compare so response time is constant regardless of
    // whether the email exists — prevents timing-based email enumeration.
    await bcrypt.compare(password, DUMMY_HASH);
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  res.json({
    token,
    user: sanitizeUser(user),
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = findUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

export default router;
