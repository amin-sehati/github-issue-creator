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
    // Headers for all GitHub API requests
    const headers = {
      'Authorization': `token ${session.accessToken}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    // Fetch user data, repositories, and organizations in parallel
    const [userResponse, personalReposResponse, orgsResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/repos?per_page=100&sort=updated', { headers }),
      fetch('https://api.github.com/user/orgs', { headers })
    ]);

    // Check if any request failed
    if (!userResponse.ok || !personalReposResponse.ok || !orgsResponse.ok) {
      if (userResponse.status === 401 || personalReposResponse.status === 401 || orgsResponse.status === 401) {
        // Token expired or invalid - clear session
        session.destroy();
        await session.save();
        return res.status(401).json({ error: 'GitHub token expired' });
      }
      throw new Error('GitHub API error');
    }

    const [user, personalRepos, organizations] = await Promise.all([
      userResponse.json(),
      personalReposResponse.json(),
      orgsResponse.json()
    ]);

    // Fetch repositories for each organization
    const orgReposPromises = organizations.map(async (org) => {
      try {
        const orgReposResponse = await fetch(`https://api.github.com/orgs/${org.login}/repos?per_page=100&sort=updated`, {
          headers
        });
        
        if (!orgReposResponse.ok) {
          console.error(`Failed to fetch repos for org ${org.login}: ${orgReposResponse.status}`);
          return { org: org.login, repos: [] };
        }
        
        const repos = await orgReposResponse.json();
        return { org: org.login, repos };
      } catch (error) {
        console.error(`Error fetching repos for org ${org.login}:`, error);
        return { org: org.login, repos: [] };
      }
    });

    const orgReposResults = await Promise.all(orgReposPromises);
    
    // Structure the data for easier frontend consumption
    const structuredData = {
      user,
      personal: {
        account: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          type: 'User'
        },
        repositories: personalRepos.filter(repo => repo.owner.login === user.login)
      },
      organizations: organizations.map(org => {
        const orgRepos = orgReposResults.find(result => result.org === org.login)?.repos || [];
        return {
          account: {
            login: org.login,
            name: org.name || org.login,
            avatar_url: org.avatar_url,
            description: org.description,
            type: 'Organization'
          },
          repositories: orgRepos
        };
      }),
      summary: {
        totalPersonalRepos: personalRepos.filter(repo => repo.owner.login === user.login).length,
        totalOrganizations: organizations.length,
        totalOrgRepos: orgReposResults.reduce((total, result) => total + result.repos.length, 0),
        totalRepos: personalRepos.length + orgReposResults.reduce((total, result) => total + result.repos.length, 0)
      }
    };

    console.log(`Account data structured: ${structuredData.summary.totalPersonalRepos} personal repos, ${structuredData.summary.totalOrganizations} orgs, ${structuredData.summary.totalOrgRepos} org repos`);

    return res.status(200).json(structuredData);
  } catch (error) {
    console.error('Error fetching account data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch account data',
      details: error.message 
    });
  }
} 