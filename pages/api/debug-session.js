import { getSession } from '../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getSession(req, res);

  // Debug information
  const debugInfo = {
    hasSession: !!session,
    hasUser: !!session?.user,
    hasAccessToken: !!session?.accessToken,
    userLogin: session?.user?.login || null,
    sessionKeys: session ? Object.keys(session) : [],
    envCheck: {
      hasGithubClientId: !!process.env.GITHUB_CLIENT_ID,
      hasGithubClientSecret: !!process.env.GITHUB_CLIENT_SECRET,
      hasSessionSecret: !!process.env.SESSION_SECRET,
      hasNextPublicClientId: !!process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
      sessionSecretLength: process.env.SESSION_SECRET?.length || 0
    },
    timestamp: new Date().toISOString()
  };

  // Log for server-side debugging
  console.log('Debug session info:', JSON.stringify(debugInfo, null, 2));

  return res.status(200).json(debugInfo);
} 