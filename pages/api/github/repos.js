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

    // Fetch user's personal repos
    const personalReposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers
    });

    if (!personalReposResponse.ok) {
      if (personalReposResponse.status === 401) {
        // Token expired or invalid - clear session
        session.destroy();
        await session.save();
        return res.status(401).json({ error: 'GitHub token expired' });
      }
      throw new Error(`GitHub API error: ${personalReposResponse.status}`);
    }

    const personalRepos = await personalReposResponse.json();

    // Fetch user's organizations
    const orgsResponse = await fetch('https://api.github.com/user/orgs', {
      headers
    });

    let organizations;
    if (!orgsResponse.ok) {
      console.error(`Failed to fetch organizations: ${orgsResponse.status} ${orgsResponse.statusText}`);
      // Don't throw error for organizations - continue with personal repos only
      organizations = [];
    } else {
      organizations = await orgsResponse.json();
      console.log(`Found ${organizations.length} organizations:`, organizations.map(org => org.login));
    }

    // Fetch repositories for each organization
    const orgReposPromises = organizations.map(org => 
      fetch(`https://api.github.com/orgs/${org.login}/repos?per_page=100&sort=updated`, {
        headers
      }).then(response => {
        if (!response.ok) {
          console.error(`Failed to fetch repos for org ${org.login}: ${response.status} ${response.statusText}`);
          return [];
        }
        return response.json();
      }).then(repos => {
        console.log(`Found ${repos.length} repositories for org ${org.login}`);
        return repos;
      }).catch(error => {
        console.error(`Error fetching repos for org ${org.login}:`, error);
        return [];
      })
    );

    const orgReposArrays = await Promise.all(orgReposPromises);
    const orgRepos = orgReposArrays.flat();
    console.log(`Total organization repositories: ${orgRepos.length}`);

    // Combine all repositories and remove duplicates
    const allRepos = [...personalRepos, ...orgRepos];
    
    // Remove duplicates based on repository ID
    const uniqueRepos = Array.from(
      new Map(allRepos.map(repo => [repo.id, repo])).values()
    );

    // Sort by updated date (most recent first)
    uniqueRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    console.log(`Final result: ${uniqueRepos.length} total repositories (${personalRepos.length} personal + ${orgRepos.length} from ${organizations.length} organizations)`);

    return res.status(200).json(uniqueRepos);
  } catch (error) {
    console.error('Error fetching repos:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch repositories',
      details: error.message 
    });
  }
} 