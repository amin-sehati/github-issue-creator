import { getSession } from '../../../lib/session';

// Input validation functions
function validateRepoName(repo) {
  if (!repo || typeof repo !== 'string') {
    return { valid: false, error: 'Repository name is required' };
  }
  
  // GitHub repo format: owner/repo
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    return { valid: false, error: 'Invalid repository format. Use owner/repo format' };
  }
  
  if (repo.length > 100) {
    return { valid: false, error: 'Repository name too long' };
  }
  
  return { valid: true };
}

function validateIssueTitle(title) {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Issue title is required' };
  }
  
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 1) {
    return { valid: false, error: 'Issue title cannot be empty' };
  }
  
  if (trimmedTitle.length > 256) {
    return { valid: false, error: 'Issue title too long (max 256 characters)' };
  }
  
  // Basic XSS prevention
  if (trimmedTitle.toLowerCase().includes('<script') || trimmedTitle.toLowerCase().includes('javascript:')) {
    return { valid: false, error: 'Invalid characters in title' };
  }
  
  return { valid: true };
}

function validateIssueBody(body) {
  if (body === null || body === undefined) {
    return { valid: true }; // Body is optional
  }
  
  if (typeof body !== 'string') {
    return { valid: false, error: 'Issue body must be a string' };
  }
  
  if (body.length > 65536) { // 64KB limit
    return { valid: false, error: 'Issue body too long (max 65536 characters)' };
  }
  
  return { valid: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Get session
  const session = await getSession(req, res);

  // Check if user is authenticated
  if (!session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Input validation
  const { repo, title, body } = req.body;

  const repoValidation = validateRepoName(repo);
  if (!repoValidation.valid) {
    return res.status(400).json({ error: repoValidation.error });
  }

  const titleValidation = validateIssueTitle(title);
  if (!titleValidation.valid) {
    return res.status(400).json({ error: titleValidation.error });
  }

  const bodyValidation = validateIssueBody(body);
  if (!bodyValidation.valid) {
    return res.status(400).json({ error: bodyValidation.error });
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
    
    // Add access token from session to the request (sanitized input)
    const requestBody = {
      repo: repo.trim(),
      title: title.trim(),
      body: body || '',
      access_token: session.accessToken
    };
    
    const response = await fetch(`${apiUrl}/create-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response:', responseText);
      return res.status(500).json({ 
        detail: 'Invalid response from backend',
        error: parseError.message,
        responseText: responseText.substring(0, 200)
      });
    }
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      detail: 'Failed to connect to Python backend',
      error: error.message 
    });
  }
} 