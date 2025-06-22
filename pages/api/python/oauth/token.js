export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { code, redirect_uri } = req.body;

  if (!code || !redirect_uri) {
    return res.status(400).json({ error: 'Missing code or redirect_uri' });
  }

  try {
    let apiUrl;
    
    if (process.env.VERCEL) {
      // In production on Vercel
      const baseUrl = `https://${req.headers.host}`;
      apiUrl = `${baseUrl}/api`;
    } else {
      // In development
      apiUrl = process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
    }
    
    const response = await fetch(`${apiUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, redirect_uri }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    
    // Return token securely to the server-side callback
    return res.status(200).json(data);
  } catch (error) {
    console.error('OAuth Token Error:', error);
    return res.status(500).json({ 
      error: 'Failed to exchange token',
      detail: error.message 
    });
  }
} 