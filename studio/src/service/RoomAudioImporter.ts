import { StudioService } from './StudioService'
import { AudioStorage } from '@/audio/AudioStorage'
import { UUID } from 'std'

/**
 * Utility class for bulk importing room audio files to OPFS on startup
 */
export class RoomAudioImporter {
    constructor(private service: StudioService) {}

    /**
     * Imports all room audio files to OPFS using the importSample method
     * This ensures all room audio files are available in OpenDAW's storage system
     * 
     * @param roomId - The room ID to import audio files for
     * @param progressCallback - Optional callback for progress updates
     * @returns Promise<number> - Number of files successfully imported
     */
    async importRoomAudioFiles(
        roomId: string, 
        progressCallback?: (progress: number, fileName: string) => void
    ): Promise<number> {
        console.log(`🎵 ROOM-IMPORT: Starting bulk import for room ${roomId}`)
        
        try {
            // Step 1: Fetch room audio files from database
            const audioFiles = await this.fetchRoomAudioFiles(roomId)
            console.log(`📁 ROOM-IMPORT: Found ${audioFiles.length} audio files in room ${roomId}`)
            
            if (audioFiles.length === 0) {
                console.log(`✅ ROOM-IMPORT: No audio files to import for room ${roomId}`)
                return 0
            }

            // Step 2: Check which files are already in OPFS
            const existingFiles = await this.getExistingOPFSFiles(roomId)
            const filesToImport = audioFiles.filter(file => 
                !existingFiles.has(file.id)
            )
            
            console.log(`📊 ROOM-IMPORT: ${filesToImport.length} new files to import (${existingFiles.size} already exist)`)
            
            if (filesToImport.length === 0) {
                console.log(`✅ ROOM-IMPORT: All files already imported for room ${roomId}`)
                return 0
            }

            // Step 3: Import each file using importSample
            let successCount = 0
            for (let i = 0; i < filesToImport.length; i++) {
                const file = filesToImport[i]
                const progress = (i / filesToImport.length) * 100
                
                try {
                    console.log(`📥 ROOM-IMPORT: [${i + 1}/${filesToImport.length}] Importing ${file.originalName}`)
                    
                    // Report progress
                    if (progressCallback) {
                        progressCallback(progress, file.originalName)
                    }
                    
                    // Download and import the file
                    await this.importSingleAudioFile(file, roomId)
                    successCount++
                    
                    console.log(`✅ ROOM-IMPORT: Successfully imported ${file.originalName}`)
                    
                } catch (error) {
                    console.error(`❌ ROOM-IMPORT: Failed to import ${file.originalName}:`, error)
                    // Continue with other files instead of stopping
                }
                
                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            // Final progress update
            if (progressCallback) {
                progressCallback(100, 'Complete')
            }

            console.log(`🎉 ROOM-IMPORT: Completed! ${successCount}/${filesToImport.length} files imported successfully`)
            return successCount

        } catch (error) {
            console.error(`❌ ROOM-IMPORT: Bulk import failed for room ${roomId}:`, error)
            throw error
        }
    }

    /**
     * Fetches audio files for a room from the database
     */
    private async fetchRoomAudioFiles(roomId: string): Promise<DatabaseAudioFile[]> {
        const token = this.getAuthToken()
        if (!token) {
            throw new Error('No authentication token available')
        }

        const apiBaseUrl = await this.getApiBaseUrl(token)
        const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/studio-project`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to fetch room audio files: HTTP ${response.status}`)
        }

        const projectData = await response.json()
        return projectData.audioFiles || []
    }

    /**
     * Gets existing OPFS files for the room to avoid re-importing
     */
    private async getExistingOPFSFiles(roomId: string): Promise<Set<string>> {
        try {
            // Try room-specific OPFS first
            const roomSamples = await AudioStorage.listRoom(roomId)
            const existingIds = new Set<string>()
            
            roomSamples.forEach(sample => {
                // Check for database ID in metadata
                const metadata = sample as any
                if (metadata.fileId) {
                    existingIds.add(metadata.fileId)
                }
                // Also check UUID in case it matches database ID
                existingIds.add(sample.uuid)
            })
            
            return existingIds
            
        } catch (error) {
            console.warn(`⚠️ ROOM-IMPORT: Could not check existing OPFS files:`, error)
            return new Set()
        }
    }

    /**
     * Imports a single audio file using the importSample method
     */
    private async importSingleAudioFile(file: DatabaseAudioFile, roomId: string): Promise<void> {
        // Download the audio file
        const arrayBuffer = await this.downloadAudioFile(file.id)
        
        // Create a descriptive name
        const shortRoomId = roomId.substring(0, 8)
        const cleanName = file.originalName.replace(/\.(wav|mp3|flac|aac)$/i, '')
        const sampleName = `${cleanName} (Room ${shortRoomId})`
        
        // Use the database ID as UUID for consistency
        const uuid = UUID.parse(file.id)
        
        // Import using the service's importSample method
        const importedSample = await this.service.importSample({
            uuid: uuid,
            name: sampleName,
            arrayBuffer: arrayBuffer,
            progressHandler: (progress) => {
                console.log(`🔄 ROOM-IMPORT: ${file.originalName} - ${(progress * 100).toFixed(1)}%`)
            }
        })

        console.log(`✅ ROOM-IMPORT: Imported ${file.originalName} with UUID ${importedSample.uuid}`)
    }

    /**
     * Downloads audio file data from the server
     */
    private async downloadAudioFile(fileId: string): Promise<ArrayBuffer> {
        const token = this.getAuthToken()
        if (!token) {
            throw new Error('No authentication token available')
        }

        const apiBaseUrl = await this.getApiBaseUrl(token)
        const response = await fetch(`${apiBaseUrl}/api/audio/stream/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })

        if (!response.ok) {
            throw new Error(`Failed to download audio file ${fileId}: HTTP ${response.status}`)
        }

        return response.arrayBuffer()
    }

    /**
     * Gets authentication token from various sources
     */
    private getAuthToken(): string | null {
        const urlParams = new URLSearchParams(window.location.search)
        
        // Try URL parameter first (base64 encoded)
        const urlToken = urlParams.get('auth_token')
        if (urlToken) {
            try {
                return atob(urlToken)
            } catch (e) {
                console.warn('Invalid base64 auth_token in URL')
            }
        }
        
        // Try sessionStorage
        const sessionToken = sessionStorage.getItem('synxsphere_token')
        if (sessionToken) return sessionToken
        
        // Try localStorage
        const localToken = localStorage.getItem('token')
        if (localToken) return localToken
        
        return null
    }

    /**
     * Determines the API base URL
     */
    private async getApiBaseUrl(token: string): Promise<string> {
        const baseUrl = 'https://app.synctown.ai:8443'
        
        try {
            const testResponse = await fetch(`${baseUrl}/api/health`, { 
                headers: { 'Authorization': `Bearer ${token}` },
                method: 'HEAD'
            })
            
            if (testResponse.ok) {
                return baseUrl
            }
        } catch (error) {
            console.warn('API health check failed:', error)
        }
        
        return baseUrl
    }
}

/**
 * Database audio file interface
 */
interface DatabaseAudioFile {
    id: string
    filename: string
    originalName: string
    filePath: string
    fileSize: number
    mimeType: string
    duration?: number
    sampleRate?: number
    channels?: number
    format?: string
    metadata?: any
}
