// Local interface that matches OpenDAW's OpfsProtocol
export type Kind = "file" | "directory"
export type Entry = { name: string, kind: Kind }

export interface OpfsProtocol {
    write(path: string, data: Uint8Array): Promise<void>
    read(path: string): Promise<Uint8Array>
    delete(path: string): Promise<void>
    list(path: string): Promise<ReadonlyArray<Entry>>
}
import { DatabaseService } from './DatabaseService'
import { WSClient } from './WSClient'
import { createCollabMessage } from './MessageTypes'
import { ProjectSerializer } from './ProjectSerializer'

// Global reference to access current project
let globalStudioService: any = null

export function setStudioServiceRef(service: any) {
  globalStudioService = service
}

export class CollaborativeOpfsAgent implements OpfsProtocol {
  private localOpfs: OpfsProtocol
  private db: DatabaseService
  private ws: WSClient
  private projectId: string
  private userId: string
  private version: number = 1
  private autoSaveTimer: NodeJS.Timeout | null = null
  private lastSaveTime = 0
  private pendingChanges = false
  
  // Audio loading deduplication
  private audioLoadingState = new Map<string, Promise<void>>()
  private loadedAudioFiles = new Set<string>()

  constructor(
    localOpfs: OpfsProtocol,
    db: DatabaseService,
    ws: WSClient,
    projectId: string,
    userId: string
  ) {
    this.localOpfs = localOpfs
    this.db = db
    this.ws = ws
    this.projectId = projectId
    this.userId = userId
    
    // Start periodic auto-save
    this.startAutoSave()
  }

  // Extract box UUID from OPFS path
  private extractBoxUuid(path: string): string | null {
    // OpenDAW paths typically: /projects/{projectId}/boxes/{boxUuid}/data
    // or variations like: /{boxUuid}.od, /box-{boxUuid}/, etc.
    
    // Try different patterns
    const patterns = [
      /\/boxes\/([a-f0-9-]{36})/i,           // /boxes/{uuid}/
      /\/([a-f0-9-]{36})\.od$/i,             // /{uuid}.od
      /\/box-([a-f0-9-]{36})/i,              // /box-{uuid}/
      /\/([a-f0-9-]{36})$/i                  // /{uuid}
    ]

    for (const pattern of patterns) {
      const match = path.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return null
  }

  // Check if path represents a box operation that needs ownership validation
  private isBoxOperation(path: string): boolean {
    const boxUuid = this.extractBoxUuid(path)
    if (!boxUuid) return false

    // Skip metadata or system files
    if (path.includes('/metadata') || path.includes('/system') || path.includes('/.')) {
      return false
    }

    return true
  }

  // Check if this is a box creation operation
  private isBoxCreation(path: string, data: Uint8Array): boolean {
    const boxUuid = this.extractBoxUuid(path)
    if (!boxUuid) return false

    // If it's a new file with data, consider it creation
    // We'll verify this doesn't exist yet
    return data.length > 0
  }

  async read(path: string): Promise<Uint8Array> {
    // Read operations don't require ownership checks
    return this.localOpfs.read(path)
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    console.log(`[CollabOpfs] Write operation: ${path}`)

    // Check for box operations that need ownership validation
    if (this.isBoxOperation(path)) {
      const boxUuid = this.extractBoxUuid(path)
      if (boxUuid) {
        console.log(`[CollabOpfs] Box operation detected: ${boxUuid}`)

        // Check if this is a new box creation
        const isCreation = this.isBoxCreation(path, data)
        
        if (isCreation) {
          // Check if box already exists
          const existingOwner = await this.db.getBoxOwner(this.projectId, boxUuid)
          
          if (!existingOwner) {
            // New box creation - claim ownership
            await this.db.setBoxOwner(this.projectId, boxUuid, this.userId)
            console.log(`[CollabOpfs] Claimed ownership of new box: ${boxUuid}`)

            // Broadcast box creation
            this.ws.send(createCollabMessage.boxCreated(
              this.projectId,
              this.userId,
              {
                boxUuid,
                boxType: 'AudioUnitBox', // We'll improve this detection later
                ownerId: this.userId
              }
            ))
          } else if (existingOwner !== this.userId) {
            throw new Error(`Box ${boxUuid} is owned by another user: ${existingOwner}`)
          }
        } else {
          // Existing box modification - check ownership
          const owner = await this.db.getBoxOwner(this.projectId, boxUuid)
          if (owner && owner !== this.userId) {
            throw new Error(`Box ${boxUuid} is owned by another user: ${owner}`)
          }

          // If no owner exists for some reason, claim it
          if (!owner) {
            await this.db.setBoxOwner(this.projectId, boxUuid, this.userId)
            console.log(`[CollabOpfs] Claimed ownership of existing box: ${boxUuid}`)
          }
        }

        // Broadcast the change if we're the owner
        this.ws.send(createCollabMessage.boxUpdated(
          this.projectId,
          this.userId,
          {
            boxUuid,
            field: 'data',
            value: data.length, // Don't send actual data, just size
            path
          }
        ))
      }
    }

    // Perform the actual write operation
    await this.localOpfs.write(path, data)

    // DISABLED: Preventing automatic project saves on every write
    // this.markPendingChanges()
    console.log(`[CollabOpfs] ✅ Write completed (auto-save disabled): ${path}`)
  }

  // Debounced project save to avoid excessive saves
  private saveTimer: any = null
  private scheduleProjectSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    
    // Save project state after 2 seconds of inactivity
    this.saveTimer = setTimeout(() => {
      this.saveProjectState()
    }, 2000)
  }

  private async saveProjectState(): Promise<void> {
    try {
      console.log(`[CollabOpfs] Saving project state for: ${this.projectId}`)
      
      // Collect all project files and data
      const projectData = await this.collectProjectData()
      
      if (projectData) {
        await this.db.saveProject(this.projectId, projectData)
        console.log(`[CollabOpfs] Project state saved successfully`)
        
        // Broadcast that project was saved
        this.ws.send(createCollabMessage.projectSaved(
          this.projectId,
          this.userId,
          { 
            projectData: projectData,
            version: this.version++
          }
        ))
      }
    } catch (error) {
      console.error('[CollabOpfs] Failed to save project state:', error)
    }
  }

  private async collectProjectData(): Promise<any | null> {
    try {
      // Start from the project root and recursively collect files
      const rootPath = `/projects/${this.projectId}`
      
      // Check if project exists
      const projectExists = await this.fileExists(rootPath)
      if (!projectExists) {
        console.log(`[CollabOpfs] Project directory doesn't exist yet: ${rootPath}`)
        return null
      }
      
      const projectFiles = await this.collectFilesRecursively(rootPath)
      
      return {
        id: this.projectId,
        name: `Project ${this.projectId}`,
        files: projectFiles,
        savedAt: new Date().toISOString(),
        savedBy: this.userId
      }
    } catch (error) {
      console.error('[CollabOpfs] Error collecting project data:', error)
      return null
    }
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await this.localOpfs.read(path)
      return true
    } catch {
      return false
    }
  }

  private async collectFilesRecursively(dirPath: string): Promise<any[]> {
    const files: any[] = []
    
    try {
      const entries = await this.localOpfs.list(dirPath)
      
      for (const entry of entries) {
        const fullPath = `${dirPath}/${entry.name}`
        
        if (entry.kind === 'directory') {
          // Recursively collect files from subdirectories
          const subFiles = await this.collectFilesRecursively(fullPath)
          files.push({
            type: 'directory',
            path: fullPath,
            name: entry.name,
            children: subFiles
          })
        } else {
          // Read file content
          try {
            const content = await this.localOpfs.read(fullPath)
            files.push({
              type: 'file',
              path: fullPath,
              name: entry.name,
              size: content.length,
              content: Array.from(content) // Convert Uint8Array to regular array for JSON serialization
            })
          } catch (error) {
            console.warn(`[CollabOpfs] Could not read file: ${fullPath}`, error)
            files.push({
              type: 'file',
              path: fullPath,
              name: entry.name,
              size: 0,
              content: [],
              error: 'Could not read file'
            })
          }
        }
      }
    } catch (error) {
      console.warn(`[CollabOpfs] Could not list directory: ${dirPath}`, error)
    }
    
    return files
  }

  // Helper method to sync ownership state
  async syncOwnershipState(): Promise<void> {
    try {
      const ownership = await this.db.getProjectOwnership(this.projectId)
      const activeUsers = await this.db.getActiveUsers(this.projectId)

      this.ws.send(createCollabMessage.syncResponse(
        this.projectId,
        this.userId,
        {
          ownership,
          locks: {}, // We'll implement locks later
          activeUsers
        }
      ))
    } catch (error) {
      console.error('[CollabOpfs] Error syncing ownership state:', error)
    }
  }

  // Method to handle incoming collaboration messages
  handleCollaborationMessage(message: any): void {
    console.log(`🎵 [CollabOpfs] handleCollaborationMessage called with type: ${message.type}`)
    switch (message.type) {
      case 'load-project':
        console.log(`📂 [CollabOpfs] DISABLED: Audio loading to prevent excessive operations`)
        console.log(`📂 [CollabOpfs] Original audio files count:`, message.audioFiles?.length || 0)
        // DISABLED: Preventing redundant audio file loading
        // if (message.audioFiles && message.audioFiles.length > 0) {
        //   this.loadRoomAudioFiles(message.audioFiles)
        // }
        break
        
      case 'BOX_CREATED':
        console.log(`[CollabOpfs] Remote box created: ${message.data.boxUuid} by ${message.userId}`)
        // We could trigger UI updates here
        break
      
      case 'BOX_UPDATED':
        console.log(`[CollabOpfs] Remote box updated: ${message.data.boxUuid} by ${message.userId}`)
        // We could trigger local refresh here
        break
      
      case 'BOX_DELETED':
        console.log(`[CollabOpfs] Remote box deleted: ${message.data.boxUuid} by ${message.userId}`)
        break
      
      case 'SYNC_REQUEST':
        console.log(`[CollabOpfs] DISABLED: Sync response to prevent excessive operations`)
        // DISABLED: Preventing sync responses that trigger more loading
        // this.syncOwnershipState()
        break
        
      default:
        console.log(`[CollabOpfs] Unhandled message type: ${message.type}`)
    }
  }

  /**
   * Load room audio files into OPFS storage for collaboration
   * This implements the method signature trace: OpenDAWIntegration → CollaborativeOpfsAgent → AudioStorage
   * PERFORMANCE: Includes deduplication to prevent redundant loading
   */
  private async loadRoomAudioFiles(audioFiles: any[]): Promise<void> {
    console.log(`🎵 [CollabOpfs] loadRoomAudioFiles called with ${audioFiles.length} files`)
    
    if (!audioFiles || audioFiles.length === 0) {
      console.log(`📂 [CollabOpfs] No audio files to load`)
      return
    }

    // Get room ID from project ID (remove 'room-' prefix)
    const roomId = this.projectId.startsWith('room-') ? this.projectId.substring(5) : this.projectId
    const loadKey = `${roomId}_${audioFiles.map(f => f.id).sort().join('_')}`
    
    // Check if this exact set of files is already being loaded
    if (this.audioLoadingState.has(loadKey)) {
      console.log(`⏳ [CollabOpfs] Audio files already loading for room ${roomId}, waiting...`)
      await this.audioLoadingState.get(loadKey)
      return
    }
    
    // Check if all files are already loaded
    const allFilesLoaded = audioFiles.every(file => this.loadedAudioFiles.has(file.id))
    if (allFilesLoaded) {
      console.log(`✅ [CollabOpfs] All audio files already loaded for room ${roomId}, skipping`)
      return
    }
    
    console.log(`🏠 [CollabOpfs] Processing audio files for room: ${roomId}`)

    // Create loading promise
    const loadingPromise = this.performAudioFileLoading(audioFiles, roomId)
    this.audioLoadingState.set(loadKey, loadingPromise)
    
    try {
      await loadingPromise
    } finally {
      // Clean up loading state
      this.audioLoadingState.delete(loadKey)
    }
  }

  /**
   * Perform the actual audio file loading (separated for deduplication)
   */
  private async performAudioFileLoading(audioFiles: any[], roomId: string): Promise<void> {
    const { AudioStorage } = await import('../audio/AudioStorage')
    const { AudioData } = await import('../audio/AudioData')
    const { UUID } = await import('std')

    // Create AudioContext for decoding
    const audioContext = new AudioContext()

    try {
      for (const audioFile of audioFiles) {
        try {
          // Skip if already loaded
          if (this.loadedAudioFiles.has(audioFile.id)) {
            console.log(`⏭️ [CollabOpfs] Audio file ${audioFile.id} already loaded, skipping`)
            continue
          }

          console.log(`🎵 [CollabOpfs] Processing audio file:`, {
            id: audioFile.id,
            name: audioFile.originalName || audioFile.filename,
            size: audioFile.size
          })

          // Download audio data from the streaming API
          const token = this.getAuthTokenForCollaboration()
          if (!token) {
            console.error(`❌ [CollabOpfs] No auth token available for downloading ${audioFile.id}`)
            continue
          }

          const response = await fetch(`https://app.synctown.ai:8443/api/audio/stream/${audioFile.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })

          if (!response.ok) {
            console.error(`❌ [CollabOpfs] Failed to download ${audioFile.id}: HTTP ${response.status}`)
            continue
          }

          const arrayBuffer = await response.arrayBuffer()
          console.log(`✅ [CollabOpfs] Downloaded ${audioFile.id} (${arrayBuffer.byteLength} bytes)`)

          // Decode audio data
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
          const openDAWAudioData = AudioData.from(audioBuffer)

          // Generate simplified peaks data
          const peaksBuffer = new ArrayBuffer(audioBuffer.length * 4)

          // Create metadata
          const metadata = {
            name: audioFile.originalName || audioFile.filename,
            duration: audioBuffer.duration,
            sample_rate: audioBuffer.sampleRate,
            bpm: 120
          }

          // Parse UUID from database
          const sampleUuid = UUID.parse(audioFile.id)

          // ✅ DUAL STORAGE: Store in both room-specific and global OPFS
          console.log(`💾 [CollabOpfs] Storing ${audioFile.id} in dual OPFS locations...`)
          
          await Promise.all([
            AudioStorage.storeInRoom(roomId, sampleUuid, openDAWAudioData, peaksBuffer, metadata),
            AudioStorage.store(sampleUuid, openDAWAudioData, peaksBuffer, metadata)
          ])

          // Mark as loaded
          this.loadedAudioFiles.add(audioFile.id)

          console.log(`✅ [CollabOpfs] Successfully stored ${audioFile.originalName} in dual OPFS locations`)

        } catch (fileError) {
          console.error(`❌ [CollabOpfs] Failed to process audio file ${audioFile.id}:`, fileError)
          // Continue with next file - don't fail the entire operation
        }
      }

      console.log(`✅ [CollabOpfs] Completed loading ${audioFiles.length} room audio files`)

    } finally {
      // Clean up AudioContext
      await audioContext.close()
    }
  }

  /**
   * Get authentication token for collaboration operations
   */
  private getAuthTokenForCollaboration(): string | null {
    // Try URL parameter first (base64 encoded)
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('auth_token')
    if (urlToken) {
      try {
        return atob(urlToken)
      } catch (e) {
        console.warn('⚠️ [CollabOpfs] Invalid base64 auth_token in URL')
      }
    }
    
    // Try sessionStorage
    const sessionToken = sessionStorage.getItem('synxsphere_token')
    if (sessionToken) {
      return sessionToken
    }
    
    // Try localStorage
    const localToken = localStorage.getItem('token')
    if (localToken) {
      return localToken
    }
    
    return null
  }

  async delete(path: string): Promise<void> {
    console.log(`[CollabOpfs] Delete operation: ${path}`)

    // Check for box operations that need ownership validation
    if (this.isBoxOperation(path)) {
      const boxUuid = this.extractBoxUuid(path)
      if (boxUuid) {
        console.log(`[CollabOpfs] Box delete operation detected: ${boxUuid}`)

        // Check ownership before allowing deletion
        const owner = await this.db.getBoxOwnership(this.projectId, boxUuid)
        if (owner && owner !== this.userId) {
          throw new Error(`Cannot delete box ${boxUuid}: owned by ${owner}`)
        }

        // Broadcast box deletion
        this.ws.send(createCollabMessage.boxDeleted(
          this.projectId,
          this.userId,
          { boxUuid }
        ))
      }
    }

    // Perform the actual delete operation
    try {
      await this.localOpfs.delete(path)
      // DISABLED: Preventing automatic project saves on every delete
      // this.markPendingChanges()
      console.log(`[CollabOpfs] ✅ Delete completed (auto-save disabled): ${path}`)
    } catch (error) {
      // If it's a "not found" error, ignore it (already deleted)
      if ((error as Error).name === 'NotFoundError') {
        console.log(`[CollabOpfs] Path ${path} already deleted or doesn't exist, skipping`)
        return
      }
      // Re-throw other errors
      throw error
    }
  }

  async list(path: string): Promise<ReadonlyArray<Entry>> {
    // List operations don't require ownership checks
    return this.localOpfs.list(path)
  }

  // Auto-save and project serialization methods
  private startAutoSave(): void {
    // DISABLED: Auto-save causing excessive database operations
    // this.autoSaveTimer = setInterval(() => {
    //   if (this.pendingChanges) {
    //     this.saveProjectToDatabase()
    //   }
    // }, 10000) // 10 seconds
    
    console.log('🔇 [CollabOpfs] Auto-save disabled to prevent excessive database operations')
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
  }

  private markPendingChanges(): void {
    this.pendingChanges = true
  }

  private async saveProjectToDatabase(): Promise<void> {
    try {
      if (!globalStudioService) {
        console.warn('[CollabOpfs] StudioService not available for project serialization')
        return
      }

      if (!globalStudioService.hasProjectSession) {
        console.warn('[CollabOpfs] No active project session to save')
        return
      }

      const project = globalStudioService.project
      if (!project) {
        console.warn('[CollabOpfs] No project instance available')
        return
      }

      console.log('[CollabOpfs] Serializing project using OpenDAW native serialization...')
      
      // Use OpenDAW's native serialization
      const serializedProject = ProjectSerializer.serialize(project, this.projectId)
      const storageFormat = ProjectSerializer.toStorageFormat(serializedProject)
      
      // Save to database using the existing save method but with serialized data
      await this.db.saveProject(this.projectId, storageFormat)
      
      this.lastSaveTime = Date.now()
      this.pendingChanges = false
      
      console.log(`[CollabOpfs] ✅ Project saved to database using OpenDAW serialization`)
      
      // Broadcast that project was saved
      this.ws.send(createCollabMessage.projectSaved(
        this.projectId,
        this.userId,
        {
          projectData: new Uint8Array(serializedProject.serializedData),
          version: this.version
        }
      ))
      
    } catch (error) {
      console.error('[CollabOpfs] Failed to save project to database:', error)
    }
  }

  // Force immediate save (useful for critical saves)
  async forceSave(): Promise<void> {
    await this.saveProjectToDatabase()
  }

  // Load project from database and restore it
  async loadProjectFromDatabase(): Promise<boolean> {
    try {
      console.log('[CollabOpfs] Loading project from database...')
      
      const projectData = await this.db.loadProject(this.projectId)
      
      if (!projectData || !projectData.data) {
        console.log('[CollabOpfs] No project data found in database')
        return false
      }

      // Check if it's a serialized project (new format)
      if (projectData.data.type === 'opendaw-serialized-project') {
        if (!globalStudioService) {
          console.error('[CollabOpfs] StudioService not available for project deserialization')
          return false
        }

        console.log('[CollabOpfs] Found serialized project, loading using OpenDAW deserialization...')
        
        const serializedProject = ProjectSerializer.fromStorageFormat(projectData.data)
        
        // Create a new project from the serialized data
        const restoredProject = ProjectSerializer.deserialize(globalStudioService, serializedProject)
        
        // TODO: We need to integrate this with the StudioService to actually switch to the loaded project
        // For now, we'll log success - this requires deeper integration with OpenDAW's session management
        console.log('[CollabOpfs] ✅ Project deserialized successfully using OpenDAW native format')
        
        return true
      } else {
        // Old format - fall back to file restoration (will be deprecated)
        console.log('[CollabOpfs] Found old file-tree format, falling back to file restoration')
        if (projectData.data.files && projectData.data.files.length > 0) {
          await this.restoreProjectFiles(projectData.data.files)
          return true
        }
      }
      
      return false
      
    } catch (error) {
      console.error('[CollabOpfs] Failed to load project from database:', error)
      return false
    }
  }

  // Legacy file restoration method (for backwards compatibility)
  private async restoreProjectFiles(files: any[]): Promise<void> {
    for (const file of files) {
      try {
        if (file.type === 'directory') {
          console.log(`[CollabOpfs] Creating directory: ${file.path}`)
          if (file.children && file.children.length > 0) {
            await this.restoreProjectFiles(file.children)
          }
        } else if (file.type === 'file' && file.content && !file.error) {
          console.log(`[CollabOpfs] Restoring file: ${file.path}`)
          const content = new Uint8Array(file.content)
          await this.localOpfs.write(file.path, content)
        }
      } catch (error) {
        console.warn(`[CollabOpfs] Failed to restore file: ${file.path}`, error)
      }
    }
  }

  // Clean up resources
  cleanup(): void {
    this.stopAutoSave()
    
    // Clear audio loading state
    this.audioLoadingState.clear()
    this.loadedAudioFiles.clear()
    console.log('🧹 [CollabOpfs] Audio loading state cleared')
  }

  /**
   * DIAGNOSTIC: Check for mismatches between room and global OPFS storage
   */
  async checkAudioFileConsistency(): Promise<void> {
    try {
      console.log('🔍 [DIAGNOSTIC] Checking audio file consistency...')
      
      const roomId = this.projectId.startsWith('room-') ? this.projectId.substring(5) : this.projectId
      console.log(`🔍 [DIAGNOSTIC] Room ID: ${roomId}`)
      
      // Import AudioStorage to check files
      const { AudioStorage } = await import('../audio/AudioStorage')
      
      // Check room folder
      const roomFolder = `samples/v2/room-${roomId}`
      const globalFolder = `samples/v2`
      
      console.log(`🔍 [DIAGNOSTIC] Checking room folder: ${roomFolder}`)
      console.log(`🔍 [DIAGNOSTIC] Checking global folder: ${globalFolder}`)
      
      let roomFiles: any[] = []
      let globalFiles: any[] = []
      
      try {
        const roomEntries = await this.localOpfs.list(roomFolder)
        roomFiles = roomEntries.filter(entry => entry.kind === 'directory').map(entry => entry.name)
        console.log(`📁 [DIAGNOSTIC] Room files found: ${roomFiles.length}`, roomFiles)
        
        // Also show what's inside each room file
        for (const file of roomFiles.slice(0, 3)) { // Limit to first 3 for brevity
          try {
            const fileContents = await this.localOpfs.list(`${roomFolder}/${file}`)
            console.log(`📄 [DIAGNOSTIC] Contents of room file ${file}:`, fileContents.map(e => e.name))
          } catch (err) {
            console.log(`📄 [DIAGNOSTIC] Could not read contents of ${file}`)
          }
        }
      } catch (error) {
        console.log(`📁 [DIAGNOSTIC] Room folder doesn't exist or is empty: ${roomFolder}`)
      }
      
      try {
        const globalEntries = await this.localOpfs.list(globalFolder)
        console.log(`📁 [DIAGNOSTIC] All entries in global folder:`, globalEntries.map(e => `${e.name} (${e.kind})`))
        
        // Filter out room folders from global files - only include actual UUID directories
        globalFiles = globalEntries
          .filter(entry => entry.kind === 'directory')
          .map(entry => entry.name)
          .filter(name => !name.startsWith('room-')) // Exclude room folders
        console.log(`📁 [DIAGNOSTIC] Global files found (excluding room folders): ${globalFiles.length}`, globalFiles)
        
        // Also show what's inside each global file
        for (const file of globalFiles.slice(0, 3)) { // Limit to first 3 for brevity
          try {
            const fileContents = await this.localOpfs.list(`${globalFolder}/${file}`)
            console.log(`📄 [DIAGNOSTIC] Contents of global file ${file}:`, fileContents.map(e => e.name))
          } catch (err) {
            console.log(`📄 [DIAGNOSTIC] Could not read contents of ${file}`)
          }
        }
      } catch (error) {
        console.log(`📁 [DIAGNOSTIC] Global folder doesn't exist or is empty: ${globalFolder}`)
      }
      
      // Check for mismatches
      const roomOnlyFiles = roomFiles.filter(file => !globalFiles.includes(file))
      const globalOnlyFiles = globalFiles.filter(file => !roomFiles.includes(file))
      const commonFiles = roomFiles.filter(file => globalFiles.includes(file))
      
      console.log(`🔍 [DIAGNOSTIC] Files only in room: ${roomOnlyFiles.length}`, roomOnlyFiles)
      console.log(`🔍 [DIAGNOSTIC] Files only in global: ${globalOnlyFiles.length}`, globalOnlyFiles)
      console.log(`🔍 [DIAGNOSTIC] Files in both: ${commonFiles.length}`, commonFiles)
      
      // Check loaded files state
      console.log(`🔍 [DIAGNOSTIC] Loaded files in memory: ${this.loadedAudioFiles.size}`, Array.from(this.loadedAudioFiles))
      
      // Summary
      if (roomOnlyFiles.length > 0 || globalOnlyFiles.length > 0) {
        console.warn(`⚠️ [DIAGNOSTIC] MISMATCH DETECTED!`)
        console.warn(`⚠️ [DIAGNOSTIC] Room-only files: ${roomOnlyFiles}`)
        console.warn(`⚠️ [DIAGNOSTIC] Global-only files: ${globalOnlyFiles}`)
        
        // Suggest fix
        if (roomOnlyFiles.length > 0) {
          console.log(`💡 [DIAGNOSTIC] SUGGESTION: Room files missing from global storage.`)
          console.log(`💡 [DIAGNOSTIC] This could indicate dual storage failed during audio loading.`)
          console.log(`💡 [DIAGNOSTIC] Run: fixDualStorage() to copy room files to global storage`)
        }
      } else {
        console.log(`✅ [DIAGNOSTIC] Audio files are consistent between room and global storage`)
      }
      
    } catch (error) {
      console.error('❌ [DIAGNOSTIC] Failed to check audio file consistency:', error)
    }
  }

  /**
   * DIAGNOSTIC: Fix dual storage by copying room files to global storage
   */
  async fixDualStorage(): Promise<void> {
    try {
      console.log('🔧 [FIX] Attempting to fix dual storage...')
      
      const roomId = this.projectId.startsWith('room-') ? this.projectId.substring(5) : this.projectId
      const roomFolder = `samples/v2/room-${roomId}`
      const globalFolder = `samples/v2`
      
      // Get room files
      let roomFiles: string[] = []
      try {
        const roomEntries = await this.localOpfs.list(roomFolder)
        roomFiles = roomEntries.filter(entry => entry.kind === 'directory').map(entry => entry.name)
        console.log(`🔧 [FIX] Found ${roomFiles.length} files in room storage:`, roomFiles)
      } catch (error) {
        console.log(`🔧 [FIX] No room files found`)
        return
      }
      
      // Check which files are missing from global
      for (const fileUuid of roomFiles) {
        try {
          // Check if exists in global
          await this.localOpfs.list(`${globalFolder}/${fileUuid}`)
          console.log(`✅ [FIX] File ${fileUuid} already exists in global storage`)
        } catch (error) {
          // File doesn't exist in global, copy it
          console.log(`🔧 [FIX] Copying ${fileUuid} from room to global storage...`)
          
          try {
            // Get all files in the room audio directory
            const roomAudioFiles = await this.localOpfs.list(`${roomFolder}/${fileUuid}`)
            
            // Copy each file
            for (const audioFile of roomAudioFiles) {
              const sourcePath = `${roomFolder}/${fileUuid}/${audioFile.name}`
              const destPath = `${globalFolder}/${fileUuid}/${audioFile.name}`
              
              console.log(`📋 [FIX] Copying ${audioFile.name}...`)
              const fileData = await this.localOpfs.read(sourcePath)
              await this.localOpfs.write(destPath, fileData)
            }
            
            console.log(`✅ [FIX] Successfully copied ${fileUuid} to global storage`)
          } catch (copyError) {
            console.error(`❌ [FIX] Failed to copy ${fileUuid}:`, copyError)
          }
        }
      }
      
      console.log(`🔧 [FIX] Dual storage fix complete!`)
      
    } catch (error) {
      console.error('❌ [FIX] Failed to fix dual storage:', error)
    }
  }
}
