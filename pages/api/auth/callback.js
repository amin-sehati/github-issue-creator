import axios from 'axios';
import { getSession } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { code, state } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  if (!state) {
    return res.status(400).json({ error: 'Invalid state parameter' });
  }

  try {
    // Exchange code for access token (server-side only)
    const tokenResponse = await axios.post(`${req.headers.origin}/api/python/oauth/token`, {
      code: code,
      redirect_uri: req.headers.origin + '/auth/callback'
    });

    const { access_token } = tokenResponse.data;

    // Fetch user data from GitHub (server-side only)
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `token ${access_token}` }
    });

    // Store token and user data in secure server-side session
    const session = await getSession(req, res);
    session.user = userResponse.data;
    session.accessToken = access_token;
    await session.save();

    // Return success without exposing the token
    return res.status(200).json({ 
      success: true,
      user: {
        login: userResponse.data.login,
        name: userResponse.data.name,
        avatar_url: userResponse.data.avatar_url
      }
    });

  } catch (error) {
    console.error('OAuth error:', error);
    
    let errorMessage = 'Failed to authenticate with GitHub';
    
    if (error.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    }
    
    return res.status(500).json({ error: errorMessage });
  }
} 