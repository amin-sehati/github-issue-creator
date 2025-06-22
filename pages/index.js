import { useState, useEffect } from 'react'
import axios from 'axios'

export default function Home() {
  const [user, setUser] = useState(null)
  const [repos, setRepos] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [issueTitle, setIssueTitle] = useState('')
  const [issueBody, setIssueBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // New state for account switching
  const [activeTab, setActiveTab] = useState('personal') // 'personal' or 'organizations'
  const [selectedOrg, setSelectedOrg] = useState(null) // Selected organization for org view
  const [repoSearchTerm, setRepoSearchTerm] = useState('') // Search/filter repositories

  useEffect(() => {
    // Check if user is already authenticated via server session
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get('/api/auth/session')
      if (response.data.isLoggedIn) {
        setIsAuthenticated(true)
        setUser(response.data.user)
        fetchUserData()
      }
    } catch (error) {
      console.error('Error checking auth status:', error)
    }
  }

  const handleGitHubLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const state = Math.random().toString(36).substring(2, 15)
    
    // Store state in localStorage for CSRF protection
    localStorage.setItem('oauth_state', state)
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}&scope=repo read:org&state=${state}&prompt=consent`
    
    window.location.href = githubAuthUrl
  }

  const fetchUserData = async () => {
    try {
      // Use secure proxy endpoints instead of direct GitHub API calls
      const [userResponse, reposResponse, orgsResponse] = await Promise.all([
        axios.get('/api/github/user'),
        axios.get('/api/github/repos'),
        axios.get('/api/github/orgs').catch((error) => {
          console.error('Organizations fetch error:', error);
          console.error('Error details:', error.response?.data);
          return { data: [] };
        })
      ])
      
      setUser(userResponse.data)
      setRepos(reposResponse.data)
      setOrganizations(orgsResponse.data)
      
      // Debug logging
      console.log('User:', userResponse.data.login)
      console.log('Total repos:', reposResponse.data.length)
      console.log('Organizations:', orgsResponse.data.map(org => org.login))
      console.log('Raw organizations data:', orgsResponse.data)
      
      // Log organization repos
      const orgReposCount = reposResponse.data.filter(repo => repo.owner.type === 'Organization').length
      console.log('Organization repos count:', orgReposCount)
      console.log('Sample org repos:', reposResponse.data.filter(repo => repo.owner.type === 'Organization').slice(0, 3))
    } catch (error) {
      console.error('Error fetching user data:', error)
      if (error.response?.status === 401) {
        // Session expired, reset auth state
        setIsAuthenticated(false)
        setUser(null)
        setRepos([])
        setOrganizations([])
        setMessage('Session expired. Please login again.')
      } else {
        setMessage('Error fetching user data')
      }
    }
  }

  const handleCreateIssue = async (e) => {
    e.preventDefault()
    if (!selectedRepo || !issueTitle.trim()) {
      setMessage('Please select a repository and enter an issue title')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      // No need to send access_token - it's handled server-side
      const response = await axios.post('/api/python/create-issue', {
        repo: selectedRepo,
        title: issueTitle,
        body: issueBody
      })

      setMessage(`Issue created successfully! #${response.data.number}`)
      setIssueTitle('')
      setIssueBody('')
    } catch (error) {
      console.error('Error creating issue:', error)
      if (error.response?.status === 401) {
        setMessage('Session expired. Please login again.')
        setIsAuthenticated(false)
        setUser(null)
        setRepos([])
        setOrganizations([])
      } else {
        setMessage('Error creating issue: ' + (error.response?.data?.detail || error.message))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await axios.delete('/api/auth/session')
      // Clear all localStorage and sessionStorage cache
      if (typeof window !== 'undefined') {
        localStorage.clear();
        sessionStorage.clear();
      }
      setIsAuthenticated(false)
      setUser(null)
      setRepos([])
      setOrganizations([])
      setMessage('')
      setActiveTab('personal')
      setSelectedOrg(null)
      setRepoSearchTerm('')
    } catch (error) {
      console.error('Error logging out:', error)
    }
  }

  // Group repositories by owner
  const groupedRepos = repos.reduce((acc, repo) => {
    const owner = repo.owner.login
    if (!acc[owner]) {
      acc[owner] = {
        isOrg: repo.owner.type === 'Organization',
        repos: []
      }
    }
    acc[owner].repos.push(repo)
    return acc
  }, {})

  // Get personal repositories
  const personalRepos = user ? (groupedRepos[user.login]?.repos || []) : []

  // Get organization repositories
  const orgRepos = Object.keys(groupedRepos)
    .filter(owner => groupedRepos[owner].isOrg)
    .reduce((acc, orgName) => {
      acc[orgName] = groupedRepos[orgName].repos
      return acc
    }, {})

  // Filter repositories based on search term
  const filterRepos = (reposList) => {
    if (!repoSearchTerm) return reposList
    return reposList.filter(repo => 
      repo.name.toLowerCase().includes(repoSearchTerm.toLowerCase()) ||
      repo.description?.toLowerCase().includes(repoSearchTerm.toLowerCase())
    )
  }

  // Get repositories to display based on active tab and selection
  const getDisplayedRepos = () => {
    if (activeTab === 'personal') {
      return filterRepos(personalRepos)
    } else if (activeTab === 'organizations') {
      if (selectedOrg) {
        return filterRepos(orgRepos[selectedOrg] || [])
      } else {
        // Show all org repos
        return filterRepos(Object.values(orgRepos).flat())
      }
    }
    return []
  }

  const displayedRepos = getDisplayedRepos()

  // Sort owners: personal repos first, then organizations alphabetically
  const sortedOwners = Object.keys(groupedRepos).sort((a, b) => {
    const aIsOrg = groupedRepos[a].isOrg
    const bIsOrg = groupedRepos[b].isOrg
    
    // Personal repos (user's repos) come first
    if (user && a === user.login && !aIsOrg) return -1
    if (user && b === user.login && !bIsOrg) return 1
    
    // Then organizations alphabetically
    if (aIsOrg && !bIsOrg) return 1
    if (!aIsOrg && bIsOrg) return -1
    
    return a.localeCompare(b)
  })

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      maxWidth: '900px', 
      margin: '0 auto', 
      padding: '20px',
      lineHeight: '1.6'
    }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>GitHub Issue Creator</h1>
      
      {!isAuthenticated ? (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
          <p>Connect your GitHub account to create issues in your repositories.</p>
          <button 
            onClick={handleGitHubLogin}
            style={{
              backgroundColor: '#24292e',
              color: 'white',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              cursor: 'pointer',
              textDecoration: 'none',
              display: 'inline-block'
            }}
          >
            Login with GitHub
          </button>
        </div>
      ) : (
        <div>
          <div style={{ 
            backgroundColor: '#f6f8fa', 
            padding: '15px', 
            borderRadius: '6px', 
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <strong>Welcome, {user?.name || user?.login}!</strong>
              <p style={{ margin: '5px 0', color: '#666' }}>
                {personalRepos.length} personal repositories
                {organizations.length > 0 && 
                  ` • ${organizations.length} organizations • ${Object.values(orgRepos).flat().length} org repositories`
                }
              </p>
            </div>
            <button 
              onClick={handleLogout}
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>

          {/* Account Switcher Tabs */}
          <div style={{
            backgroundColor: '#f6f8fa',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              borderBottom: '2px solid #e1e4e8',
              marginBottom: '20px'
            }}>
              <button
                onClick={() => {
                  setActiveTab('personal')
                  setSelectedOrg(null)
                  setRepoSearchTerm('')
                }}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  background: 'none',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  color: activeTab === 'personal' ? '#0366d6' : '#586069',
                  borderBottom: activeTab === 'personal' ? '2px solid #0366d6' : '2px solid transparent',
                  marginBottom: '-2px'
                }}
              >
                👤 Personal ({personalRepos.length})
              </button>
              {organizations.length > 0 && (
                <button
                  onClick={() => {
                    setActiveTab('organizations')
                    setSelectedOrg(null)
                    setRepoSearchTerm('')
                  }}
                  style={{
                    padding: '12px 20px',
                    border: 'none',
                    background: 'none',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    color: activeTab === 'organizations' ? '#0366d6' : '#586069',
                    borderBottom: activeTab === 'organizations' ? '2px solid #0366d6' : '2px solid transparent',
                    marginBottom: '-2px'
                  }}
                >
                  🏢 Organizations ({organizations.length})
                </button>
              )}
            </div>

            {/* Organization Selector (only shown in organizations tab) */}
            {activeTab === 'organizations' && organizations.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                  Select Organization:
                </label>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <button
                    onClick={() => setSelectedOrg(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      backgroundColor: selectedOrg === null ? '#0366d6' : 'white',
                      color: selectedOrg === null ? 'white' : '#24292e',
                      padding: '8px 12px',
                      border: '1px solid #e1e4e8',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    All Organizations ({Object.values(orgRepos).flat().length} repos)
                  </button>
                  {organizations.map(org => (
                    <button
                      key={org.id}
                      onClick={() => setSelectedOrg(org.login)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: selectedOrg === org.login ? '#0366d6' : 'white',
                        color: selectedOrg === org.login ? 'white' : '#24292e',
                        padding: '8px 12px',
                        border: '1px solid #e1e4e8',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      <img 
                        src={org.avatar_url} 
                        alt={org.login}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '3px'
                        }}
                      />
                      {org.login} ({orgRepos[org.login]?.length || 0})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Repository Search */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                Search Repositories:
              </label>
              <input
                type="text"
                value={repoSearchTerm}
                onChange={(e) => setRepoSearchTerm(e.target.value)}
                placeholder={`Search in ${activeTab === 'personal' ? 'personal' : selectedOrg ? selectedOrg : 'all organization'} repositories...`}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #e1e4e8',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            {/* Repository Grid */}
            <div>
              <h3 style={{ margin: '0 0 15px 0', color: '#24292e', fontSize: '18px' }}>
                {activeTab === 'personal' 
                  ? `Personal Repositories (${displayedRepos.length})`
                  : selectedOrg 
                    ? `${selectedOrg} Repositories (${displayedRepos.length})`
                    : `All Organization Repositories (${displayedRepos.length})`
                }
              </h3>
              
              {displayedRepos.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#586069',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e1e4e8'
                }}>
                  {repoSearchTerm ? `No repositories found matching "${repoSearchTerm}"` : 'No repositories found'}
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '15px'
                }}>
                  {displayedRepos.map(repo => (
                    <div 
                      key={repo.id} 
                      onClick={() => setSelectedRepo(repo.full_name)}
                      style={{
                        padding: '15px',
                        backgroundColor: selectedRepo === repo.full_name ? '#e3f2fd' : 'white',
                        borderRadius: '8px',
                        border: selectedRepo === repo.full_name ? '2px solid #0366d6' : '1px solid #e1e4e8',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        marginBottom: '8px',
                        gap: '8px'
                      }}>
                        <h4 style={{ 
                          margin: 0, 
                          color: '#0366d6', 
                          fontSize: '16px',
                          fontWeight: '600'
                        }}>
                          {repo.name}
                        </h4>
                        {repo.private && <span title="Private" style={{ fontSize: '14px' }}>🔒</span>}
                        {selectedRepo === repo.full_name && <span style={{ color: '#0366d6' }}>✓</span>}
                      </div>
                      
                      <p style={{
                        margin: '8px 0',
                        fontSize: '13px',
                        color: '#586069',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {repo.description || 'No description available'}
                      </p>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '12px',
                        color: '#586069'
                      }}>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          {repo.language && (
                            <span>🔧 {repo.language}</span>
                          )}
                          <span>🌟 {repo.stargazers_count}</span>
                        </div>
                        <span>Updated {new Date(repo.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Issue Creation Form */}
          <form onSubmit={handleCreateIssue}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Selected Repository:
              </label>
              {selectedRepo ? (
                <div style={{
                  padding: '10px',
                  backgroundColor: '#e3f2fd',
                  border: '1px solid #0366d6',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#0366d6'
                }}>
                  📁 {selectedRepo}
                </div>
              ) : (
                <div style={{
                  padding: '10px',
                  backgroundColor: '#f8f9fa',
                  border: '1px solid #e9ecef',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: '#6c757d'
                }}>
                  Please select a repository from above
                </div>
              )}
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Issue Title:
              </label>
              <input
                type="text"
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
                placeholder="Enter issue title..."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
                required
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Issue Description (optional):
              </label>
              <textarea
                value={issueBody}
                onChange={(e) => setIssueBody(e.target.value)}
                placeholder="Enter issue description..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? '#6c757d' : '#28a745',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%'
              }}
            >
              {loading ? 'Creating Issue...' : 'Create Issue'}
            </button>
          </form>

          {message && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              backgroundColor: message.includes('Error') || message.includes('expired') ? '#f8d7da' : '#d4edda',
              color: message.includes('Error') || message.includes('expired') ? '#721c24' : '#155724',
              border: `1px solid ${message.includes('Error') || message.includes('expired') ? '#f5c6cb' : '#c3e6cb'}`,
              borderRadius: '4px'
            }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  )
} 