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
  private baseUrl: string = 'http://localhost:3003/api'

  constructor(connectionString?: string) {
    // Connection string is ignored in browser mode
    // Database operations are proxied through the WebSocket/HTTP server
  }

  async connect(): Promise<void> {
    // No-op in browser mode
  }

  async disconnect(): Promise<void> {
    // No-op in browser mode
  }

  async saveProject(projectId: string, projectData: any): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      })
    } catch (error) {
      console.error('Failed to save project:', error)
    }
  }

  async loadProject(projectId: string): Promise<any | null> {
    try {
      const response = await fetch(`${this.baseUrl}/projects/${projectId}`)
      if (response.ok) {
        return await response.json()
      }
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, boxId, userId })
      })
    } catch (error) {
      console.error('Failed to release box ownership:', error)
    }
  }

  async getBoxOwnership(projectId: string, boxId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/boxes/owner/${projectId}/${boxId}`)
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
      const response = await fetch(`${this.baseUrl}/boxes/ownerships/${projectId}`)
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
        method: 'DELETE'
      })
      return true
    } catch (error) {
      console.error('Failed to remove user session:', error)
      return false
    }
  }

  async getActiveSessions(projectId: string): Promise<UserSession[]> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${projectId}`)
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
        // Set a short timeout
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch (error) {
      console.warn('Database ping failed:', error)
      return false
    }
  }
}
