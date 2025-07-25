import { CollaborativeOpfsAgent, setStudioServiceRef } from './CollaborativeOpfsAgent'
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
  studioService?: any // Reference to StudioService for project operations
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
      wsUrl: 'wss://localhost:8443/ws',
      dbUrl: 'https://localhost:8443',
      ...config
    }
  }

  async initialize(originalOpfsAgent: any): Promise<CollaborativeOpfsAgent> {
    if (this.isInitialized) {
      throw new Error('Collaboration already initialized')
    }

    try {
      console.log('[Collaboration] Initializing collaboration layer...')

      // Set global StudioService reference for project serialization
      if (this.config.studioService) {
        setStudioServiceRef(this.config.studioService)
        console.log('[Collaboration] StudioService reference set for project serialization')
      } else {
        console.warn('[Collaboration] No StudioService provided - project serialization will be limited')
      }

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

      // Send USER_JOIN message
      await this.sendUserJoin()

      // Load existing project data if available
      await this.loadExistingProject()

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

  private async sendUserJoin(): Promise<void> {
    if (this.ws) {
      const userJoinMessage = {
        type: 'USER_JOIN' as const,
        projectId: this.config.projectId,
        userId: this.config.userId,
        timestamp: Date.now(),
        data: {
          username: this.config.userName || `User ${this.config.userId.slice(0, 8)}`,
          avatar: undefined
        }
      }
      
      console.log('[Collaboration] Sending USER_JOIN:', userJoinMessage)
      this.ws.send(userJoinMessage)
    }
  }

  private async loadExistingProject(): Promise<void> {
    try {
      console.log('[Collaboration] Loading existing project data...')
      
      // Use the CollaborativeOpfsAgent's new project loading system
      if (this.collaborativeAgent) {
        const success = await this.collaborativeAgent.loadProjectFromDatabase()
        if (success) {
          console.log('[Collaboration] ✅ Project loaded successfully using OpenDAW serialization')
        } else {
          console.log('[Collaboration] No existing project data found, starting fresh')
        }
      } else {
        console.error('[Collaboration] CollaborativeOpfsAgent not initialized')
      }
    } catch (error) {
      console.error('[Collaboration] Failed to load existing project:', error)
    }
  }

  private async restoreProjectFiles(files: any[]): Promise<void> {
    for (const file of files) {
      try {
        if (file.type === 'directory') {
          // Create directory (OPFS might handle this automatically)
          console.log(`[Collaboration] Creating directory: ${file.path}`)
          if (file.children && file.children.length > 0) {
            await this.restoreProjectFiles(file.children)
          }
        } else if (file.type === 'file' && file.content && !file.error) {
          // Restore file content
          console.log(`[Collaboration] Restoring file: ${file.path}`)
          const content = new Uint8Array(file.content)
          await this.collaborativeAgent!.write(file.path, content)
        }
      } catch (error) {
        console.warn(`[Collaboration] Failed to restore file: ${file.path}`, error)
      }
    }
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
