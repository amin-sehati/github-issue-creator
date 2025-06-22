// Session configuration for iron-session
export const sessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: 'github-oauth-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day instead of 7 days for better security
    path: '/'
  }
};

// Type definitions for TypeScript (optional)
export const sessionConfig = {
  user: undefined,
  accessToken: undefined
};

// Helper function to get session for iron-session v8
import { getIronSession } from 'iron-session';

export async function getSession(req, res) {
  const session = await getIronSession(req, res, sessionOptions);
  return session;
} 