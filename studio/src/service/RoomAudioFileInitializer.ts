import { StudioService } from './StudioService'
import { RoomAudioImporter } from './RoomAudioImporter'

/**
 * Initialize room audio files on OpenDAW startup
 * This function should be called when OpenDAW starts up to ensure
 * all room audio files are available in OPFS for use
 */
export async function initializeRoomAudioFiles(service: StudioService): Promise<void> {
    console.log('🚀 STARTUP: Initializing room audio files...')
    
    try {
        // Get room ID from URL
        const roomId = extractRoomIdFromUrl()
        if (!roomId) {
            console.log('📝 STARTUP: No room ID found, skipping room audio initialization')
            return
        }

        console.log(`🏠 STARTUP: Found room ID: ${roomId}`)

        // Create importer instance
        const importer = new RoomAudioImporter(service)

        // Import all room audio files with progress tracking
        let lastProgress = 0
        const importedCount = await importer.importRoomAudioFiles(roomId, (progress, fileName) => {
            // Only log progress every 10% to avoid spam
            if (Math.floor(progress / 10) > Math.floor(lastProgress / 10)) {
                console.log(`📊 STARTUP: Room audio import progress: ${Math.round(progress)}% (${fileName})`)
                lastProgress = progress
            }
        })

        if (importedCount > 0) {
            console.log(`✅ STARTUP: Successfully imported ${importedCount} room audio files to OPFS`)
            
            // Optionally notify the UI that new samples are available
            service.resetPeaks() // This triggers sample list refresh
        } else {
            console.log('📋 STARTUP: All room audio files already available in OPFS')
        }

    } catch (error) {
        console.error('❌ STARTUP: Failed to initialize room audio files:', error)
        // Don't throw - startup should continue even if this fails
    }
}

/**
 * Extract room ID from current URL
 */
function extractRoomIdFromUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search)
    
    // First try 'roomId' parameter
    const urlRoomId = urlParams.get('roomId')
    if (urlRoomId) {
        return urlRoomId
    }
    
    // Try 'projectId' parameter
    const projectId = urlParams.get('projectId')
    if (projectId && projectId.startsWith('room-')) {
        return projectId.replace('room-', '')
    } else if (projectId) {
        return projectId
    }
    
    // Try to extract from URL path
    const pathMatch = window.location.pathname.match(/\/room\/([^\/]+)/)
    if (pathMatch) {
        return pathMatch[1]
    }

    return null
}

/**
 * Example usage - call this from your main startup code:
 * 
 * ```typescript
 * // In your main.ts or app initialization
 * import { initializeRoomAudioFiles } from './service/RoomAudioFileInitializer'
 * 
 * // After StudioService is created
 * const service = new StudioService(...)
 * 
 * // Initialize room audio files
 * await initializeRoomAudioFiles(service)
 * ```
 */
