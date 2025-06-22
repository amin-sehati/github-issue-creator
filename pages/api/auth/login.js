import { getSession } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // This endpoint is deprecated - authentication is now handled securely in /api/auth/callback
  return res.status(400).json({ 
    error: 'This endpoint is deprecated. Use /api/auth/callback for secure authentication.' 
  });
} 