// Browser-compatible database service using REST API
export interface BoxOwnership {
  projectId: string
  boxUuid: string
  ownerId: string
  ownedAt: Date
}

export interface BoxLock {
  projectId: string
  boxUuid: string
  lockedBy: string
  lockedAt: Date
  expiresAt: Date
}

export interface UserSession {
  id: string
  projectId: string
  userId: string
  connectedAt: Date
  lastSeen: Date
}

export class DatabaseService {
  private baseUrl: string = 'http://localhost:8000/api' // Changed to main SynxSphere API
  private authToken: string | null = null

  constructor(connectionString?: string) {
    // Connection string is ignored in browser mode
    // Database operations are proxied through the WebSocket/HTTP server
    
    // Try to get auth token from various sources
    const urlParams = new URLSearchParams(window.location.search)
    const urlAuthToken = urlParams.get('auth_token') // Note: using 'auth_token' not 'authToken'
    
    this.authToken = urlAuthToken ? atob(urlAuthToken) : null // Decode base64 token from URL
    if (!this.authToken) {
      this.authToken = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
    }
    
    // Also try parent window token (for iframe scenarios)
    if (!this.authToken) {
      try {
        if (window.parent && window.parent !== window) {
          const parentToken = window.parent.localStorage.getItem('token');
          if (parentToken) {
            this.authToken = parentToken;
            console.log('[DatabaseService] Using token from parent window')
          }
        }
      } catch (e) {
        console.warn('[DatabaseService] Could not access parent window token:', e.message)
      }
    }
    
    if (this.authToken) {
      console.log('[DatabaseService] Authentication token found')
    } else {
      console.warn('[DatabaseService] No authentication token found')
    }
  }
  
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    return headers
  }
  
  private getAuthHeadersGetOnly(): HeadersInit {
    const headers: HeadersInit = {}
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    return headers
  }

  async connect(): Promise<void> {
    // No-op in browser mode
  }

  async disconnect(): Promise<void> {
    // No-op in browser mode
  }

  async close(): Promise<void> {
    // No-op in browser mode - same as disconnect
    await this.disconnect()
  }

  async saveProject(projectId: string, projectData: any): Promise<void> {
    try {
      // Check if this is a room-based project
      let apiUrl = `${this.baseUrl}/projects/${projectId}`
      if (projectId.startsWith('room-')) {
        // For room projects, use the rooms API endpoint
        const roomId = projectId.replace('room-', '')
        apiUrl = `${this.baseUrl}/rooms/${roomId}/studio-project`
        console.log(`[DatabaseService] Saving room project to: ${apiUrl}`)
      }
      
      await fetch(apiUrl, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(projectData)
      })
    } catch (error) {
      console.error('Failed to save project:', error)
    }
  }

  async loadProject(projectId: string): Promise<any | null> {
    try {
      // Check if this is a room-based project
      let apiUrl = `${this.baseUrl}/projects/${projectId}`
      if (projectId.startsWith('room-')) {
        // For room projects, use the rooms API endpoint
        const roomId = projectId.replace('room-', '')
        apiUrl = `${this.baseUrl}/rooms/${roomId}/studio-project`
        console.log(`[DatabaseService] Loading room project from: ${apiUrl}`)
      }
      
      const response = await fetch(apiUrl, {
        headers: this.getAuthHeadersGetOnly()
      })
      if (response.ok) {
        return await response.json()
      }
      
      if (response.status === 404) {
        console.log(`[DatabaseService] Project not found (404): ${projectId}`)
        return null
      }
      
      console.error(`[DatabaseService] Failed to load project ${projectId}: ${response.status} ${response.statusText}`)
      return null
    } catch (error) {
      console.error('Failed to load project:', error)
      return null
    }
  }

  async acquireBoxOwnership(projectId: string, boxId: string, userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/boxes/acquire`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ projectId, boxId, userId })
      })
      return response.ok
    } catch (error) {
      console.error('Failed to acquire box ownership:', error)
      return false
    }
  }

  async releaseBoxOwnership(projectId: string, boxId: string, userId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/boxes/release`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ projectId, boxId, userId })
      })
    } catch (error) {
      console.error('Failed to release box ownership:', error)
    }
  }

  async getBoxOwnership(projectId: string, boxId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/boxes/owner/${projectId}/${boxId}`, {
        headers: this.getAuthHeadersGetOnly()
      })
      if (response.ok) {
        const data = await response.json()
        return data.userId || null
      }
      return null
    } catch (error) {
      console.error('Failed to get box ownership:', error)
      return null
    }
  }

  async getAllBoxOwnerships(projectId: string): Promise<{ [boxId: string]: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/boxes/ownerships/${projectId}`, {
        headers: this.getAuthHeadersGetOnly()
      })
      if (response.ok) {
        return await response.json()
      }
      return {}
    } catch (error) {
      console.error('Failed to get all box ownerships:', error)
      return {}
    }
  }

  async cleanupExpiredLocks(): Promise<void> {
    // Handled server-side
  }

  // Legacy methods for compatibility
  async setBoxOwnership(boxOwnership: BoxOwnership): Promise<boolean> {
    return this.acquireBoxOwnership(boxOwnership.projectId, boxOwnership.boxUuid, boxOwnership.ownerId)
  }

  async getBoxOwners(projectId: string): Promise<BoxOwnership[]> {
    const ownerships = await this.getAllBoxOwnerships(projectId)
    return Object.entries(ownerships).map(([boxUuid, ownerId]) => ({
      projectId,
      boxUuid,
      ownerId,
      ownedAt: new Date()
    }))
  }

  async removeBoxOwnership(projectId: string, boxUuid: string): Promise<boolean> {
    // This doesn't specify a user, so we'll call the server to release any ownership
    try {
      await fetch(`${this.baseUrl}/boxes/release-any`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ projectId, boxId: boxUuid })
      })
      return true
    } catch (error) {
      console.error('Failed to remove box ownership:', error)
      return false
    }
  }

  async acquireBoxLock(projectId: string, boxUuid: string, userId: string): Promise<boolean> {
    return this.acquireBoxOwnership(projectId, boxUuid, userId)
  }

  async releaseBoxLock(projectId: string, boxUuid: string, userId: string): Promise<boolean> {
    await this.releaseBoxOwnership(projectId, boxUuid, userId)
    return true
  }

  async getBoxLock(projectId: string, boxUuid: string): Promise<BoxLock | null> {
    const owner = await this.getBoxOwnership(projectId, boxUuid)
    if (owner) {
      return {
        projectId,
        boxUuid,
        lockedBy: owner,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      }
    }
    return null
  }

  async createUserSession(projectId: string, userId: string): Promise<UserSession> {
    const session: UserSession = {
      id: `${userId}-${Date.now()}`,
      projectId,
      userId,
      connectedAt: new Date(),
      lastSeen: new Date()
    }
    
    try {
      await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(session)
      })
    } catch (error) {
      console.error('Failed to create user session:', error)
    }
    
    return session
  }

  async updateUserSession(sessionId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ lastSeen: new Date() })
      })
      return true
    } catch (error) {
      console.error('Failed to update user session:', error)
      return false
    }
  }

  async removeUserSession(sessionId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: this.getAuthHeadersGetOnly()
      })
      return true
    } catch (error) {
      console.error('Failed to remove user session:', error)
      return false
    }
  }

  async getActiveSessions(projectId: string): Promise<UserSession[]> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${projectId}`, {
        headers: this.getAuthHeadersGetOnly()
      })
      if (response.ok) {
        return await response.json()
      }
      return []
    } catch (error) {
      console.error('Failed to get active sessions:', error)
      return []
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Simple connectivity test by attempting to fetch from the API
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.getAuthHeadersGetOnly(),
        // Set a short timeout
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch (error) {
      console.warn('Database ping failed:', error)
      return false
    }
  }

  async getBoxOwner(projectId: string, boxUuid: string): Promise<string | null> {
    return this.getBoxOwnership(projectId, boxUuid)
  }

  async setBoxOwner(projectId: string, boxUuid: string, ownerId: string): Promise<void> {
    await this.acquireBoxOwnership(projectId, boxUuid, ownerId)
  }

  async getProjectOwnership(projectId: string): Promise<Record<string, string>> {
    return this.getAllBoxOwnerships(projectId)
  }

  async getActiveUsers(projectId: string): Promise<string[]> {
    // This is handled by the WebSocket server in real-time
    // For the browser client, we'll return an empty array as this data
    // comes through WebSocket messages
    return []
  }
}
