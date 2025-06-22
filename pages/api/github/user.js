import { getSession } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Get session
  const session = await getSession(req, res);

  // Check if user is authenticated
  if (!session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Fetch user data from GitHub using server-side token
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${session.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid - clear session
        session.destroy();
        await session.save();
        return res.status(401).json({ error: 'GitHub token expired' });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const userData = await response.json();
    return res.status(200).json(userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch user data',
      details: error.message 
    });
  }
} 