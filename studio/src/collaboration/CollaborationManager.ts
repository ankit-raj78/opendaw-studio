import { CollaborativeOpfsAgent, setStudioServiceRef } from './CollaborativeOpfsAgent'
import { DatabaseService } from './DatabaseService'
import { WSClient } from './WSClient'
import { OverlayManager } from './OverlayManager'
import { CollabMessage, CollabMessageType } from '../../../../opendaw-collab-mvp/src/websocket/MessageTypes'
import { AudioClipBox, AudioRegionBox } from '../data/boxes'
import { UUID, Option } from 'std'

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
  private latestTimestamp: number = 0

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
        // Also expose globally for WSClient access
        ;(window as any).globalStudioService = this.config.studioService
        
        // Add monitoring for globalStudioService
        let lastContext = this.config.studioService?.context
        setInterval(() => {
          const current = (window as any).globalStudioService
          const currentContext = current?.context
          if (!current) {
            console.error('🚨 globalStudioService became undefined!')
          } else if (!currentContext && lastContext) {
            console.error('🚨 AudioContext became undefined!')
          } else if (currentContext?.state !== lastContext?.state) {
            console.log('🔊 AudioContext state changed:', lastContext?.state, '->', currentContext?.state)
          }
          lastContext = currentContext
        }, 5000)
        
        console.log('[Collaboration] StudioService reference set for project serialization and WSClient access')
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
      
      // Expose WebSocket client globally for UI components
      ;(window as any).wsClient = this.ws
      console.log('[Collaboration] ✅ WebSocket client exposed globally as window.wsClient')
      // send sync request (since last known timestamp)
      const since = Number(sessionStorage.getItem(`collab_since_${this.config.projectId}`)) || undefined
      this.ws.send({
          type: 'SYNC_REQUEST',
          projectId: this.config.projectId,
          userId: this.config.userId,
          timestamp: Date.now(),
          data: { since }
      } as any)

      // register sync response handler
      ;(this.ws as any).onSyncResponse = (events?: CollabMessage[]) => {
          events?.forEach((ev: CollabMessage) => {
              this.applyEvent(ev)
              this.latestTimestamp = Math.max(this.latestTimestamp, (ev as any).timestamp || 0)
          })
          sessionStorage.setItem(`collab_since_${this.config.projectId}`, String(this.latestTimestamp))
      }

      // Register region created handler
      ;(this.ws as any).onRegionCreated = (payload: any, fromUser: string) => {
          console.log('[CollaborationManager] Region created by', fromUser, payload)
          const { regionId, trackId, startTime, duration, sampleId } = payload
          
          // Get the studio service from window or config
          const studioService = (window as any).globalStudioService || this.config.studioService
          if (!studioService?.project) {
              console.warn('[CollaborationManager] No project available for region creation')
              return
          }
          
          try {
              // Call the applyEvent method which handles region creation
              this.applyEvent({
                  type: 'REGION_CREATED',
                  projectId: this.config.projectId,
                  userId: fromUser,
                  timestamp: Date.now(),
                  data: payload
              } as CollabMessage)
          } catch (error) {
              console.error('[CollaborationManager] Failed to create region:', error)
          }
      }
      
      // Register clip created handler
      ;(this.ws as any).onClipCreated = (payload: any, fromUser: string) => {
          console.log('[CollaborationManager] Clip created by', fromUser, payload)
          // Similar logic for clips if needed
      }

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
      
      // Set up timeline deletion monitoring
      this.setupTimelineDeletionMonitoring()

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

  private applyEvent(event: CollabMessage) {
      console.log('[Collaboration] Applying event:', event)
      try {
          const studioService = this.config.studioService
          if (!studioService?.project) {
              console.warn('[Collaboration] No project available for event:', event.type)
              return
          }

          switch (event.type) {
              case 'DRAG_TRACK':
                  const { trackId, newIndex } = event.data
                  // Find adapter by UUID and calculate delta for moveIndex
                  const trackAdapter = studioService.project.boxGraph.findBox(trackId)
                      ?.let(box => studioService.project.boxAdapters.adapterFor(box, (window as any).AudioUnitBoxAdapter))
                  if (trackAdapter) {
                      const currentIndex = trackAdapter.indexField.getValue()
                      const delta = newIndex - currentIndex
                      if (Math.abs(delta) > 0) {
                          studioService.project.editing.modify(() => 
                              studioService.project.rootBoxAdapter.audioUnits.moveIndex(currentIndex, delta)
                          )
                      }
                  }
                  break

              case 'UPDATE_TRACK':
                  const { parameterId, parameterType, value } = event.data
                  // Find parameter by UUID and update it
                  if (parameterId && typeof value !== 'undefined') {
                      const parameter = studioService.project.boxGraph.findBox(parameterId)
                          ?.let(box => box.unwrap?.())
                      if (parameter && typeof parameter.setUnitValue === 'function') {
                          studioService.project.editing.modify(() => 
                              parameter.setUnitValue(value), false
                          )
                          studioService.project.editing.mark()
                      }
                  }
                  break

              // Timeline-specific events
              case 'CLIP_CREATED':
                  const { clipId, trackId: clipTrackId, startTime: clipStartTime, duration: clipDuration, sampleId: clipSampleId } = event.data
                  console.log('[Collaboration] Creating clip from remote user:', { clipId, clipTrackId, clipStartTime, clipDuration, clipSampleId })
                  
                  try {
                      // Parse UUID strings back to UUID format
                      const clipUuid = UUID.parse(clipId)
                      const trackUuid = UUID.parse(clipTrackId)
                      const sampleUuid = (clipSampleId && clipSampleId !== 'unknown') ? UUID.parse(clipSampleId) : undefined
                      
                      // Find the target track and sample
                      const targetTrack = studioService.project.boxGraph.findBox(trackUuid)
                      const sampleFile = sampleUuid ? studioService.project.boxGraph.findBox(sampleUuid) : undefined
                      
                      if (targetTrack.nonEmpty()) {
                          const trackBox = targetTrack.unwrap()
                          studioService.project.editing.modify(() => {
                              AudioClipBox.create(studioService.project.boxGraph, clipUuid, (box: any) => {
                                  box.index?.setValue(clipStartTime)
                                  box.duration?.setValue(clipDuration)  
                                  box.clips?.refer(trackBox.clips)
                                  if (sampleFile?.nonEmpty?.()) {
                                      box.file?.refer(sampleFile.unwrap())
                                  }
                              })
                              console.log('[Collaboration] ✅ Clip created successfully')
                          })
                      } else {
                          console.warn('[Collaboration] Target track not found for clip creation:', clipTrackId)
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUIDs for clip creation:', uuidError)
                  }
                  break

              case 'CLIP_DELETED':
                  const { clipId: deleteClipId } = event.data
                  try {
                      const clipUuidToDelete = UUID.parse(deleteClipId)
                      const clipToDelete = studioService.project.boxGraph.findBox(clipUuidToDelete)
                      if (clipToDelete.nonEmpty()) {
                          console.log('[Collaboration] Deleting clip:', deleteClipId)
                          studioService.project.editing.modify(() => 
                              clipToDelete.unwrap().delete()
                          )
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUID for clip deletion:', uuidError)
                  }
                  break

              case 'CLIP_MOVED':
                  const { clipId: moveClipId, trackId: moveTrackId, newTrackId, startTime } = event.data
                  try {
                      const clipUuidToMove = UUID.parse(moveClipId)
                      const clipToMove = studioService.project.boxGraph.findBox(clipUuidToMove)
                      if (clipToMove.nonEmpty()) {
                          const clip = clipToMove.unwrap()
                          console.log('[Collaboration] Moving clip:', { moveClipId, startTime, newTrackId })
                          studioService.project.editing.modify(() => {
                              clip.index?.setValue(startTime)
                              if (newTrackId && newTrackId !== moveTrackId) {
                                  const newTrackUuid = UUID.parse(newTrackId)
                                  const newTrack = studioService.project.boxGraph.findBox(newTrackUuid)
                                  if (newTrack.nonEmpty()) {
                                      clip.clips?.refer(newTrack.unwrap().clips)
                                  }
                              }
                          })
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUIDs for clip movement:', uuidError)
                  }
                  break

              case 'REGION_CREATED':
                  const { regionId, trackId: regionTrackId, startTime: regionStartTime, duration: regionDuration, sampleId: regionSampleId } = event.data
                  console.log('[Collaboration] Creating region from remote user:', { regionId, regionTrackId, regionStartTime, regionDuration, regionSampleId })
                  
                  try {
                      // Parse UUID strings back to UUID format
                      const regionUuid = UUID.parse(regionId)
                      const trackUuid = UUID.parse(regionTrackId)
                      const sampleUuid = (regionSampleId && regionSampleId !== 'unknown') ? UUID.parse(regionSampleId) : undefined
                      
                      // Find the target track and sample
                      const targetRegionTrack = studioService.project.boxGraph.findBox(trackUuid)
                      const regionSampleFile = sampleUuid ? studioService.project.boxGraph.findBox(sampleUuid) : undefined
                      
                      if (targetRegionTrack.nonEmpty()) {
                          const trackBox = targetRegionTrack.unwrap()
                          studioService.project.editing.modify(() => {
                              AudioRegionBox.create(studioService.project.boxGraph, regionUuid, (box: any) => {
                                  box.position?.setValue(regionStartTime)
                                  box.duration?.setValue(regionDuration)
                                  box.loopDuration?.setValue(regionDuration)
                                  box.regions?.refer(trackBox.regions)
                                  if (regionSampleFile?.nonEmpty?.()) {
                                      box.file?.refer(regionSampleFile.unwrap())
                                  }
                              })
                              console.log('[Collaboration] ✅ Region created successfully')
                          })
                      } else {
                          console.warn('[Collaboration] Target track not found for region creation:', regionTrackId)
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUIDs for region creation:', uuidError)
                  }
                  break

              case 'REGION_DELETED':
                  const { regionId: deleteRegionId } = event.data
                  try {
                      const regionUuidToDelete = UUID.parse(deleteRegionId)
                      const regionToDelete = studioService.project.boxGraph.findBox(regionUuidToDelete)
                      if (regionToDelete.nonEmpty()) {
                          console.log('[Collaboration] Deleting region:', deleteRegionId)
                          studioService.project.editing.modify(() => 
                              regionToDelete.unwrap().delete()
                          )
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUID for region deletion:', uuidError)
                  }
                  break

              case 'REGION_MOVED':
                  const { regionId: moveRegionId, trackId: moveRegionTrackId, newTrackId: newRegionTrackId, startTime: moveRegionStartTime } = event.data
                  try {
                      const regionUuidToMove = UUID.parse(moveRegionId)
                      const regionToMove = studioService.project.boxGraph.findBox(regionUuidToMove)
                      if (regionToMove.nonEmpty()) {
                          const region = regionToMove.unwrap()
                          console.log('[Collaboration] Moving region:', { moveRegionId, moveRegionStartTime, newRegionTrackId })
                          studioService.project.editing.modify(() => {
                              region.position?.setValue(moveRegionStartTime)
                              if (newRegionTrackId && newRegionTrackId !== moveRegionTrackId) {
                                  const newTrackUuid = UUID.parse(newRegionTrackId)
                                  const newTrack = studioService.project.boxGraph.findBox(newTrackUuid)
                                  if (newTrack.nonEmpty()) {
                                      region.regions?.refer(newTrack.unwrap().regions)
                                  }
                              }
                          })
                      }
                  } catch (uuidError) {
                      console.error('[Collaboration] Failed to parse UUIDs for region movement:', uuidError)
                  }
                  break

              case 'TIMELINE_CHANGE':
                  const { targetId, targetType, property, value: changeValue } = event.data
                  const target = studioService.project.boxGraph.findBox(targetId)
                  if (target.nonEmpty()) {
                      const targetBox = target.unwrap()
                      console.log('[Collaboration] Applying timeline change:', { targetId, targetType, property, changeValue })
                      studioService.project.editing.modify(() => {
                          if (targetBox[property] && typeof targetBox[property].setValue === 'function') {
                              targetBox[property].setValue(changeValue)
                          }
                      })
                  }
                  break

              default:
                  console.debug('[Collaboration] Unhandled event:', event.type)
          }
      } catch (error) {
          console.error('[Collaboration] Error applying event:', event.type, error)
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

  private setupTimelineDeletionMonitoring(): void {
    try {
      const studioService = this.config.studioService
      if (!studioService?.project) {
        console.warn('[Collaboration] No project available for deletion monitoring')
        return
      }

      // Monitor box deletions by intercepting the box graph's delete operations
      const project = studioService.project
      const originalDelete = project.boxGraph.deleteBox?.bind(project.boxGraph)
      
      if (originalDelete) {
        project.boxGraph.deleteBox = (boxId: any) => {
          try {
            const box = project.boxGraph.findBox(boxId)
            if (box.nonEmpty()) {
              const boxInstance = box.unwrap()
              
              // Check if it's a clip or region being deleted
              if (boxInstance.constructor.name === 'AudioClipBox') {
                const trackBox = boxInstance.clips?.parent
                const trackId = trackBox?.uuid || 'unknown'
                
                console.log('[Collaboration] Broadcasting clip deletion:', {
                  clipId: boxInstance.uuid,
                  trackId
                })
                
                this.ws?.send({
                  type: 'CLIP_DELETED',
                  projectId: this.config.projectId,
                  userId: this.config.userId,
                  timestamp: Date.now(),
                  data: { clipId: boxInstance.uuid, trackId }
                })
              } else if (boxInstance.constructor.name === 'AudioRegionBox') {
                const trackBox = boxInstance.regions?.parent
                const trackId = trackBox?.uuid || 'unknown'
                
                console.log('[Collaboration] Broadcasting region deletion:', {
                  regionId: boxInstance.uuid,
                  trackId
                })
                
                this.ws?.send({
                  type: 'REGION_DELETED',
                  projectId: this.config.projectId,
                  userId: this.config.userId,
                  timestamp: Date.now(),
                  data: { regionId: boxInstance.uuid, trackId }
                })
              }
            }
          } catch (err) {
            console.error('[Collaboration] Error broadcasting deletion:', err)
          }
          
          // Call original delete method
          return originalDelete(boxId)
        }
      }
    } catch (err) {
      console.error('[Collaboration] Failed to setup deletion monitoring:', err)
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
