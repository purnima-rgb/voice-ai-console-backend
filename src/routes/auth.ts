import { Router, Request, Response } from 'express';
import { signInWithSupabase, findUserById } from '../services/authService';
import { generateToken, authenticateToken } from '../middleware/auth';
import { loginLimiter } from '../app';

const router = Router();

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await signInWithSupabase(email, password);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken({ userId: user.id, email: user.email, role: user.role });
  res.json({ token, user });
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await findUserById(req.user.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
});

export default router;
