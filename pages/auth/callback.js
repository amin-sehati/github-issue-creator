import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'

export default function OAuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    const handleCallback = async () => {
      const { code, state } = router.query

      if (!code) {
        setStatus('Error: No authorization code received')
        return
      }

      // Verify state parameter for CSRF protection
      const storedState = localStorage.getItem('oauth_state')
      if (state !== storedState) {
        setStatus('Error: Invalid state parameter')
        return
      }

      // Clear stored state
      localStorage.removeItem('oauth_state')

      try {
        // Use secure server-side callback handler
        const response = await axios.post('/api/auth/callback', {
          code: code,
          state: state
        })

        setStatus('Authentication successful! Redirecting...')
        
        // Redirect to home page
        setTimeout(() => {
          router.push('/')
        }, 2000)

      } catch (error) {
        console.error('OAuth error:', error)
        
        let errorMessage = 'Failed to authenticate with GitHub'
        
        if (error.response?.data?.error) {
          errorMessage = error.response.data.error
        }
        
        setStatus(`Error: ${errorMessage}`)
      }
    }

    if (router.isReady) {
      handleCallback()
    }
  }, [router.isReady, router.query])

  return (
    <div style={{ 
      fontFamily: 'Arial, sans-serif', 
      maxWidth: '600px', 
      margin: '0 auto', 
      padding: '20px',
      textAlign: 'center',
      marginTop: '50px'
    }}>
      <h1>GitHub OAuth</h1>
      <p>{status}</p>
      
      {status.includes('Error') && (
        <button 
          onClick={() => router.push('/')}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '20px'
          }}
        >
          Go Home
        </button>
      )}
    </div>
  )
} 