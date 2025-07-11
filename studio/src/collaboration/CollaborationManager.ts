import { CollaborativeOpfsAgent } from './CollaborativeOpfsAgent'
import { DatabaseService } from './DatabaseService'
import { WSClient } from './WSClient'
import { OverlayManager } from './OverlayManager'
import { CollabMessage } from './MessageTypes'

export interface CollaborationConfig {
  projectId: string
  userId: string
  wsUrl?: string
  dbUrl?: string
  userName?: string
}

export class CollaborationManager {
  private config: CollaborationConfig
  private db: DatabaseService | null = null
  private ws: WSClient | null = null
  private overlay: OverlayManager | null = null
  private collaborativeAgent: CollaborativeOpfsAgent | null = null
  private isInitialized = false

  constructor(config: CollaborationConfig) {
    this.config = {
      wsUrl: 'ws://localhost:3005',
      dbUrl: 'http://localhost:3003',
      ...config
    }
  }

  async initialize(originalOpfsAgent: any): Promise<CollaborativeOpfsAgent> {
    if (this.isInitialized) {
      throw new Error('Collaboration already initialized')
    }

    try {
      console.log('[Collaboration] Initializing collaboration layer...')

      // Initialize database service
      this.db = new DatabaseService(this.config.dbUrl!)
      const isDbConnected = await this.db.ping()
      if (!isDbConnected) {
        throw new Error('Database connection failed')
      }

      // Initialize WebSocket client
      this.ws = new WSClient(this.config.wsUrl!, this.config.projectId, this.config.userId)
      await this.ws.connect()

      // Initialize UI overlay
      this.overlay = new OverlayManager(this.config.projectId, this.config.userId)
      this.overlay.updateConnectionStatus('connected')

      // Create collaborative OPFS agent
      this.collaborativeAgent = new CollaborativeOpfsAgent(
        originalOpfsAgent,
        this.db,
        this.ws,
        this.config.projectId,
        this.config.userId
      )

      // Set up message handlers
      this.setupMessageHandlers()

      // Request initial sync
      await this.requestSync()

      this.isInitialized = true
      console.log('[Collaboration] ✅ Collaboration layer initialized successfully')

      return this.collaborativeAgent

    } catch (error) {
      console.error('[Collaboration] ❌ Failed to initialize collaboration:', error)
      await this.cleanup()
      throw error
    }
  }

  private setupMessageHandlers(): void {
    if (!this.ws || !this.overlay) return

    // Handle connection status changes
    this.ws.onMessage('USER_JOIN', (message) => {
      this.overlay!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('USER_LEAVE', (message) => {
      this.overlay!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('BOX_CREATED', (message) => {
      this.overlay!.handleCollaborationMessage(message)
      this.collaborativeAgent!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('BOX_UPDATED', (message) => {
      this.overlay!.handleCollaborationMessage(message)
      this.collaborativeAgent!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('BOX_DELETED', (message) => {
      this.overlay!.handleCollaborationMessage(message)
      this.collaborativeAgent!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('BOX_OWNERSHIP_CLAIMED', (message) => {
      this.overlay!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('SYNC_RESPONSE', (message) => {
      this.overlay!.handleCollaborationMessage(message)
    })

    this.ws.onMessage('ERROR', (message) => {
      console.error('[Collaboration] Server error:', message.data)
      this.overlay!.updateConnectionStatus('disconnected')
    })
  }

  requestSync(): void {
    if (this.ws) {
      this.ws.send({
        type: 'SYNC_REQUEST',
        projectId: this.config.projectId,
        userId: this.config.userId,
        timestamp: Date.now(),
        data: {}
      })
    }
  }

  async cleanup(): Promise<void> {
    console.log('[Collaboration] Cleaning up collaboration layer...')

    if (this.overlay) {
      this.overlay.destroy()
      this.overlay = null
    }

    if (this.ws) {
      this.ws.disconnect()
      this.ws = null
    }

    if (this.db) {
      await this.db.close()
      this.db = null
    }

    this.collaborativeAgent = null
    this.isInitialized = false

    console.log('[Collaboration] ✅ Cleanup complete')
  }

  // Public API methods

  isActive(): boolean {
    return this.isInitialized && this.ws?.isConnected === true
  }

  getConnectionStatus(): string {
    if (!this.ws) return 'disconnected'
    return this.ws.connectionState
  }

  async claimBoxOwnership(boxUuid: string): Promise<boolean> {
    if (!this.db) return false

    try {
      await this.db.setBoxOwner(this.config.projectId, boxUuid, this.config.userId)
      
      if (this.ws) {
        this.ws.send({
          type: 'BOX_OWNERSHIP_CLAIMED',
          projectId: this.config.projectId,
          userId: this.config.userId,
          timestamp: Date.now(),
          data: { boxUuid, ownerId: this.config.userId }
        })
      }

      return true
    } catch (error) {
      console.error('[Collaboration] Failed to claim box ownership:', error)
      return false
    }
  }

  async getBoxOwner(boxUuid: string): Promise<string | null> {
    if (!this.db) return null
    return this.db.getBoxOwner(this.config.projectId, boxUuid)
  }

  // Event handling methods
  onUserJoined(callback: (data: any) => void): void {
    if (this.ws) {
      this.ws.onMessage('USER_JOIN', callback)
    }
  }

  onUserLeft(callback: (data: any) => void): void {
    if (this.ws) {
      this.ws.onMessage('USER_LEAVE', callback)
    }
  }

  onSyncResponse(callback: (data: any) => void): void {
    if (this.ws) {
      this.ws.onMessage('SYNC_RESPONSE', callback)
    }
  }

  // Static helper to check if collaboration should be enabled
  static shouldEnable(): boolean {
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    const userId = urlParams.get('userId')
    const collaborative = urlParams.get('collaborative')

    return !!(projectId && userId && collaborative === 'true')
  }

  // Static helper to extract config from URL
  static getConfigFromURL(): CollaborationConfig | null {
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    const userId = urlParams.get('userId')
    const userName = urlParams.get('userName')

    if (!projectId || !userId) {
      return null
    }

    return {
      projectId,
      userId,
      userName: userName || undefined
    }
  }
}

// Global collaboration manager instance
let globalCollaboration: CollaborationManager | null = null

// Export helper functions for OpenDAW integration
export const initializeCollaboration = async (originalOpfsAgent: any): Promise<any> => {
  const config = CollaborationManager.getConfigFromURL()
  
  if (!config) {
    console.log('[Collaboration] No collaboration config found, using local mode')
    return originalOpfsAgent
  }

  if (!CollaborationManager.shouldEnable()) {
    console.log('[Collaboration] Collaboration not enabled, using local mode')
    return originalOpfsAgent
  }

  try {
    globalCollaboration = new CollaborationManager(config)
    const collaborativeAgent = await globalCollaboration.initialize(originalOpfsAgent)
    
    // Set up cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (globalCollaboration) {
        globalCollaboration.cleanup()
      }
    })

    return collaborativeAgent
  } catch (error) {
    console.error('[Collaboration] Failed to initialize, falling back to local mode:', error)
    return originalOpfsAgent
  }
}

export const getCollaborationManager = (): CollaborationManager | null => {
  return globalCollaboration
}
