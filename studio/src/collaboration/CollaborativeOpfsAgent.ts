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

export class CollaborativeOpfsAgent implements OpfsProtocol {
  private localOpfs: OpfsProtocol
  private db: DatabaseService
  private ws: WSClient
  private projectId: string
  private userId: string

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
    return this.localOpfs.write(path, data)
  }

  async delete(path: string): Promise<void> {
    console.log(`[CollabOpfs] Delete operation: ${path}`)

    // Check ownership for box deletions
    if (this.isBoxOperation(path)) {
      const boxUuid = this.extractBoxUuid(path)
      if (boxUuid) {
        const owner = await this.db.getBoxOwner(this.projectId, boxUuid)
        if (owner && owner !== this.userId) {
          throw new Error(`Cannot delete box ${boxUuid} - owned by another user: ${owner}`)
        }

        // Broadcast box deletion
        this.ws.send(createCollabMessage.boxDeleted(
          this.projectId,
          this.userId,
          { boxUuid }
        ))

        // Remove ownership record
        // We'll add this method to DatabaseService later
      }
    }

    return this.localOpfs.delete(path)
  }

  async list(path: string): Promise<ReadonlyArray<Entry>> {
    // List operations don't require ownership checks
    return this.localOpfs.list(path)
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
    switch (message.type) {
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
        // Respond with current state
        this.syncOwnershipState()
        break
        
      default:
        console.log(`[CollabOpfs] Unhandled message type: ${message.type}`)
    }
  }
}
