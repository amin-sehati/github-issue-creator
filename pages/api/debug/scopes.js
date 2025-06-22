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
    // Check what scopes the current token has
    const response = await fetch('https://api.github.com/user', {
      method: 'HEAD',
      headers: {
        'Authorization': `token ${session.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        session.destroy();
        await session.save();
        return res.status(401).json({ error: 'GitHub token expired' });
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    // GitHub returns scopes in the X-OAuth-Scopes header
    const scopes = response.headers.get('X-OAuth-Scopes');
    const acceptedScopes = response.headers.get('X-Accepted-OAuth-Scopes');

    // Test organization access
    let orgTestResult = null;
    try {
      const orgResponse = await fetch('https://api.github.com/user/orgs', {
        headers: {
          'Authorization': `token ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (orgResponse.ok) {
        const orgs = await orgResponse.json();
        orgTestResult = {
          success: true,
          organizationsFound: orgs.length,
          organizations: orgs.map(org => ({
            login: org.login,
            public: org.description ? true : false // Basic indicator
          }))
        };
      } else {
        orgTestResult = {
          success: false,
          error: `HTTP ${orgResponse.status}: ${orgResponse.statusText}`,
          details: 'Failed to fetch organizations'
        };
      }
    } catch (error) {
      orgTestResult = {
        success: false,
        error: error.message,
        details: 'Exception while testing organization access'
      };
    }

    return res.status(200).json({
      tokenScopes: scopes ? scopes.split(', ') : [],
      acceptedScopes: acceptedScopes ? acceptedScopes.split(', ') : [],
      hasReadOrgScope: scopes ? scopes.includes('read:org') : false,
      hasRepoScope: scopes ? scopes.includes('repo') : false,
      organizationAccess: orgTestResult,
      recommendations: {
        readOrgRequired: !scopes || !scopes.includes('read:org'),
        repoRequired: !scopes || !scopes.includes('repo'),
        reauthorizationNeeded: !scopes || !(scopes.includes('read:org') && scopes.includes('repo'))
      }
    });
  } catch (error) {
    console.error('Error checking scopes:', error);
    return res.status(500).json({ 
      error: 'Failed to check token scopes',
      details: error.message 
    });
  }
} 