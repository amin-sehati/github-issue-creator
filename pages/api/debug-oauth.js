export default async function handler(req, res) {
  const apiUrl = process.env.VERCEL 
    ? `https://${req.headers.host}/api`
    : process.env.PYTHON_API_URL || 'http://127.0.0.1:8000';
  
  try {
    const response = await fetch(apiUrl);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      return res.status(200).json({
        frontend_env: {
          vercel: !!process.env.VERCEL,
          host: req.headers.host,
          api_url: apiUrl
        },
        backend_status: {
          error: 'Invalid JSON response',
          status: response.status,
          responseText: text.substring(0, 500)
        }
      });
    }
    
    res.status(200).json({
      frontend_env: {
        vercel: !!process.env.VERCEL,
        host: req.headers.host,
        api_url: apiUrl
      },
      backend_status: data
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to connect to backend',
      message: error.message,
      apiUrl: apiUrl
    });
  }
} 