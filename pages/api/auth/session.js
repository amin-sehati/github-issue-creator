import { getSession } from '../../../lib/session';

export default async function handler(req, res) {
  const session = await getSession(req, res);

  if (req.method === 'GET') {
    // Get session data
    const user = session.user;
    
    if (!user) {
      return res.status(200).json({ 
        isLoggedIn: false,
        user: null 
      });
    }
    
    return res.status(200).json({
      isLoggedIn: true,
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url
      }
    });
  } else if (req.method === 'DELETE') {
    // Logout - destroy session
    session.destroy();
    await session.save();
    return res.status(200).json({ success: true });
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
} 