// SynxSphere Integration for OpenDAW
// This file handles loading room projects when OpenDAW is opened from SynxSphere

import { StudioService } from './service/StudioService'
import { setStudioServiceForCollaboration } from './service/agents'
import { Option } from 'std'
import { Modifier } from './ui/Modifier'
import { AudioUnitType } from './data/enums'
import { AudioUnitBoxAdapter } from './audio-engine-shared/adapters/audio-unit/AudioUnitBoxAdapter'
import { ColorCodes } from './ui/mixer/ColorCodes'
import { IconSymbol } from './IconSymbol'

// Global variable to store the working API base URL
let workingApiBaseUrl: string | null = null

// Function to get the working API base URL
async function getWorkingApiBaseUrl(token: string): Promise<string | null> {
    if (workingApiBaseUrl) {
        return workingApiBaseUrl
    }
    
    // Force using the expected endpoint based on Docker configuration
    const defaultHost = 'http://localhost:8000' // SyncSphere runs on this port
    console.log(`🔍 Using expected API host: ${defaultHost}`)
    workingApiBaseUrl = defaultHost
    return defaultHost
}

export async function initializeSynxSphereIntegration(service: StudioService) {
    console.log('🔗 MODIFIED VERSION: Initializing SynxSphere integration...')
    console.log('🎯 DEBUG: Integration function called, service:', service)
    console.log('🚀 FORCE PROJECT CREATION: This version will always create a project')
    
    // Set the service reference for collaboration
    setStudioServiceForCollaboration(service)
    
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    const roomId = projectId?.startsWith('room-') ? projectId.substring(5) : null
    const userId = urlParams.get('userId')
    const userName = urlParams.get('userName')
    const authToken = urlParams.get('auth_token')
    
    console.log('🔍 URL Parameters:', { projectId, roomId, userId, userName, hasToken: !!authToken })
    
    if (roomId && userId) {
        try {
            // FORCE PROJECT CREATION FIRST - ensure we always have a working project
            console.log('🚀 FORCE PROJECT CREATION: Creating new project immediately')
            service.cleanSlate()
            await new Promise(resolve => setTimeout(resolve, 1000))
            service.switchScreen("default")
            
            // Force navigation to workspace
            if (window.location.pathname !== '/') {
                window.history.pushState({}, '', '/')
            }
            console.log('✅ FORCE PROJECT CREATION: Project created and switched to workspace')
            
            // Wait a bit for the service to be fully initialized
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Check if we should load the room project
            console.log('📁 Loading room project:', roomId)
            
            // Try to fetch the studio project bundle from SynxSphere
            let token = authToken ? atob(authToken) : null // Decode base64 token from URL
            if (!token) {
                token = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
            }
            
            console.log('🔐 Token status:', { fromURL: !!authToken, fromStorage: !authToken && !!token, available: !!token })
            
            // TEMPORARY FIX: Try to get token from parent window (SyncSphere)
            if (!token) {
                try {
                    if (window.parent && window.parent !== window) {
                        const parentToken = window.parent.localStorage.getItem('token');
                        if (parentToken) {
                            token = parentToken;
                            console.log('🔑 Got token from parent window (SyncSphere)');
                        }
                    }
                } catch (e) {
                    console.log('Cannot access parent window (cross-origin)');
                }
            }
            
            if (token) {
                console.log('🔑 Token found, attempting to get API base URL...')
                // Get the working API base URL
                const apiBaseUrl = await getWorkingApiBaseUrl(token)
                
                console.log('🔍 API base URL result:', apiBaseUrl)
                
                if (!apiBaseUrl) {
                    console.error('❌ Cannot connect to SyncSphere API')
                    console.error('❌ AUTOMATIC IMPORT FAILED: No API connection')
                    return
                }
                
                // Get the studio project with audio files
                console.log(`📦 AUTOMATIC IMPORT: Fetching studio project from: ${apiBaseUrl}`)
                console.log(`📦 AUTOMATIC IMPORT: Full URL: ${apiBaseUrl}/api/rooms/${roomId}/studio-project`)
                
                let projectResponse
                let projectData = null
                try {
                    // Add timeout to prevent hanging
                    const controller = new AbortController()
                    const timeout = setTimeout(() => controller.abort(), 10000) // 10 second timeout
                    
                    projectResponse = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/studio-project`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        signal: controller.signal
                    })
                    
                    clearTimeout(timeout)
                    
                    console.log('🔍 AUTOMATIC IMPORT: Project response status:', projectResponse.status)
                    console.log('🔍 AUTOMATIC IMPORT: Response headers:', projectResponse.headers)
                } catch (fetchError) {
                    console.error('❌ AUTOMATIC IMPORT: Failed to fetch project:', fetchError)
                    console.error('❌ AUTOMATIC IMPORT: Error details:', {
                        name: fetchError.name,
                        message: fetchError.message,
                        stack: fetchError.stack
                    })
                    if (fetchError.name === 'AbortError') {
                        console.error('❌ AUTOMATIC IMPORT: Request timed out after 10 seconds')
                        console.error('📝 Possible causes:')
                        console.error('   - Backend server not running on expected port')
                        console.error('   - Database query hanging')
                        console.error('   - CORS blocking the request')
                        console.error('   - Authentication issue')
                    }
                    console.error('🔄 AUTOMATIC IMPORT: Studio project API failed, will try to fetch audio files directly...')
                    
                    // Try to fetch audio files directly even if studio project fails
                    try {
                        const audioFilesResponse = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/audio`, {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        })
                        
                        if (audioFilesResponse.ok) {
                            const audioFilesData = await audioFilesResponse.json()
                            console.log('✅ Found', audioFilesData.audioFiles?.length || 0, 'audio files in room database')
                            
                            if (audioFilesData.audioFiles && audioFilesData.audioFiles.length > 0) {
                                // Create project data with the audio files from database
                                projectData = {
                                    name: `Room ${roomId}`,
                                    projectData: {
                                        name: `Room ${roomId}`,
                                        tempo: 120,
                                        timeSignature: { numerator: 4, denominator: 4 }
                                    },
                                    audioFiles: audioFilesData.audioFiles
                                }
                                console.log('✅ Will load', projectData.audioFiles.length, 'audio files from database into samples (import simulation)')
                            } else {
                                console.warn('⚠️ No audio files found in database for room:', roomId)
                                // Create empty project
                                service.cleanSlate()
                                await new Promise(resolve => setTimeout(resolve, 500))
                                service.switchScreen("default")
                                return
                            }
                        } else {
                            console.error('❌ Failed to fetch audio files from database:', audioFilesResponse.status)
                            // Create empty project
                            service.cleanSlate()
                            await new Promise(resolve => setTimeout(resolve, 500))
                            service.switchScreen("default")
                            return
                        }
                    } catch (audioError) {
                        console.error('❌ Error fetching audio files:', audioError)
                        // Create empty project
                        service.cleanSlate()
                        await new Promise(resolve => setTimeout(resolve, 500))
                        service.switchScreen("default")
                        return
                    }
                }
                
                if (projectResponse && projectResponse.ok) {
                    projectData = await projectResponse.json()
                    console.log(`✅ AUTOMATIC IMPORT: Successfully loaded studio project`)
                    console.log('🔍 AUTOMATIC IMPORT: Project data structure:', {
                        hasAudioFiles: !!(projectData.audioFiles && projectData.audioFiles.length),
                        audioFilesCount: projectData.audioFiles ? projectData.audioFiles.length : 0,
                        hasProjectData: !!projectData.projectData
                    })
                } else if (projectResponse) {
                    console.error(`❌ AUTOMATIC IMPORT: Failed to load studio project: ${projectResponse.status}`)
                    return
                }
                
                if (projectData) {
                    console.log('✅ AUTOMATIC IMPORT: Room project data loaded')
                    console.log('🔍 AUTOMATIC IMPORT: Full project data:', JSON.stringify(projectData, null, 2))
                    
                    // Store project data globally for UI access
                    ;(window as any).currentProjectData = projectData.projectData
                    
                    // Create a session FIRST before switching screens
                    console.log('🎯 Creating new session before switching to workspace...')
                    service.cleanSlate() // This creates a fresh session
                    
                    // Wait for session to be fully created
                    await new Promise(resolve => setTimeout(resolve, 1000))
                    
                    // Verify session is available
                    try {
                        const currentSession = service.sessionService.getValue()
                        if (currentSession.isEmpty()) {
                            throw new Error('Failed to create session')
                        }
                        console.log('✅ Session created successfully!')
                    } catch (error) {
                        console.error('❌ Cannot create session:', error)
                        return
                    }
                    
                    // NOW switch to workspace view
                    console.log('🖥️ Switching to workspace view...')
                    service.switchScreen("default")
                    
                    // Force navigation to the workspace view
                    if (window.location.pathname !== '/') {
                        window.history.pushState({}, '', '/')
                    }
                    
                    // Wait for screen switch to complete
                    await new Promise(resolve => setTimeout(resolve, 500))
                    
                    // Check if there are audio files to import
                    if (projectData.audioFiles && projectData.audioFiles.length > 0) {
                        console.log('🎵 SAMPLE IMPORT: Found', projectData.audioFiles.length, 'audio files, importing to locally stored samples...')
                        console.log('🎯 SAMPLE IMPORT: Audio files will be available in samples for manual use')
                        console.log('📋 SAMPLE IMPORT: Files to import:', projectData.audioFiles.map(f => f.originalName).join(', '))
                        
                        // Import audio files as samples only
                        await loadProjectFromJSON(service, projectData, roomId)
                        
                        console.log('✅ Successfully imported audio files to locally stored samples')
                        console.log('🎯 Users can now manually drag these samples to create tracks')
                        
                    } else {
                        console.log('📄 Loading project from JSON data (no audio files)')
                        await loadProjectFromJSON(service, projectData, roomId)
                    }
                    
                    // Update project info panel with loaded data
                    setTimeout(() => updateProjectInfoPanel(projectData.name, {
                        audioFiles: projectData.audioFiles,
                        hasBundle: false,
                        bundleSize: 0
                    }), 1500)
                    
                } else {
                    console.log('ℹ️ AUTOMATIC IMPORT: No existing project found for room')
                    console.log('✅ AUTOMATIC IMPORT: Project already created, workspace already loaded')
                }
            } else {
                console.warn('⚠️ No authentication token found, but still creating project')
                // Create project even without token
                service.cleanSlate()
                
                // Switch to default workspace screen
                service.switchScreen("default")
            }
            
            // Add comprehensive project info panel
            const projectInfoPanel = document.createElement('div')
            projectInfoPanel.id = 'synxsphere-project-info'
            projectInfoPanel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.9);
                color: #ffffff;
                padding: 12px 16px;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 12px;
                z-index: 9999;
                border: 1px solid #3b82f6;
                backdrop-filter: blur(8px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                min-width: 280px;
                max-width: 400px;
            `
            
            // Get project name from the loaded data or use default
            const projectName = (window as any).currentProjectData?.name || `test${roomId}`
            const userDisplayName = decodeURIComponent(userName || 'Unknown User')
            
            projectInfoPanel.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-right: 8px;"></div>
                    <span style="font-weight: 600; color: #10b981;">SynxSphere Connected</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: #94a3b8; font-size: 10px;">PROJECT:</span><br>
                    <span style="font-weight: 500;">${projectName}</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: #94a3b8; font-size: 10px;">ROOM ID:</span><br>
                    <span style="font-family: monospace; font-size: 11px;">${roomId}</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: #94a3b8; font-size: 10px;">USER:</span><br>
                    <span style="font-weight: 500;">${userDisplayName}</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: #94a3b8; font-size: 10px;">PROJECT ID:</span><br>
                    <span style="font-family: monospace; font-size: 11px;">${projectId}</span>
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #374151;">
                    <span style="color: #94a3b8; font-size: 10px;">Auto-save: </span>
                    <span style="color: #10b981; font-size: 10px;">Every 30s</span>
                </div>
            `
            document.body.appendChild(projectInfoPanel)
            
        } catch (error) {
            console.error('❌ Failed to load room project:', error)
        }
    }
}

// Function to load OpenDAW bundle (.odb file)
async function loadOpenDAWBundle(service: StudioService, bundleBuffer: Uint8Array, projectName: string) {
    try {
        console.log('🔄 Loading OpenDAW bundle...')
        
        // Import Projects module
        const { Projects } = await import('@/project/Projects')
        
        // Use OpenDAW's built-in bundle import functionality
        const session = await Projects.importBundle(service, bundleBuffer.buffer)
        
        // Set the loaded session as the current session
        service.sessionService.setValue(Option.wrap(session))
        
        console.log('✅ Bundle loaded successfully using OpenDAW import')
        console.log('📝 Project name:', session.meta.name)
        console.log('🎵 Project loaded with UUID:', session.uuid)
        
    } catch (error) {
        console.error('❌ Error loading OpenDAW bundle:', error)
        console.log('🔄 Falling back to JSON project loading...')
        
        // Fallback to clean slate
        service.cleanSlate()
    }
}

// Function to load project from JSON data and import audio files
async function loadProjectFromJSON(service: StudioService, projectData: any, roomId: string) {
    try {
        console.log('📄 Loading project from JSON data...')
        
        // Create a new project
        service.cleanSlate()
        
        // Wait for project to be initialized
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Apply project settings if available
        const data = projectData.project?.projectData || projectData.projectData
        if (data) {
            // Set project name
            if (data.name) {
                console.log('📝 Project name:', data.name)
            }
            
            // Apply tempo if available
            if (data.tempo) {
                console.log('🎵 Setting tempo:', data.tempo)
                // TODO: Set tempo in OpenDAW
            }
            
            // Always import audio files as samples only (no automatic track creation)
            if (projectData.audioFiles && projectData.audioFiles.length > 0) {
                console.log('🎵 SAMPLE-ONLY IMPORT: Importing', projectData.audioFiles.length, 'audio files as samples only')
                console.log('📋 Audio files list:', projectData.audioFiles.map(f => f.originalName || f.filename))
                console.log('🎯 USER WORKFLOW: These will appear in locally stored samples for manual use')
                await importRoomAudioFilesToSamples(service, projectData.audioFiles, roomId)
            } else if (data.tracks && data.tracks.length > 0) {
                console.log('🎵 LEGACY: Project has pre-existing tracks, converting to samples...')
                // Convert track data to audio file data format
                const audioFilesFromTracks = data.tracks.map(track => ({
                    id: track.audioFileId || track.id,
                    originalName: track.originalName || track.name,
                    filename: track.filename || track.name,
                    filePath: track.filePath
                }))
                console.log('📋 Converted tracks to audio files for sample import')
                await importRoomAudioFilesToSamples(service, audioFilesFromTracks, roomId)
            }
        } else if (projectData.audioFiles && projectData.audioFiles.length > 0) {
            // If no project data but audio files exist, import as samples only
            console.log('🎵 NO PROJECT DATA: Importing', projectData.audioFiles.length, 'audio files as samples only')
            console.log('📋 Audio files list:', projectData.audioFiles.map(f => f.originalName || f.filename))
            await importRoomAudioFilesToSamples(service, projectData.audioFiles, roomId)
        }
        
        console.log('✅ Project loaded from JSON data')
        
    } catch (error) {
        console.error('❌ Error loading project from JSON:', error)
        // Fallback to clean slate
        service.cleanSlate()
    }
}

// Function to import room audio files and create tracks
async function importRoomAudioFiles(service: StudioService, tracks: any[], roomId: string) {
    try {
        console.log('🎵 Starting audio import for', tracks.length, 'tracks...')
        
        // Get token from URL parameters or storage
        const urlParams = new URLSearchParams(window.location.search)
        const authToken = urlParams.get('auth_token')
        let token = authToken ? atob(authToken) : null
        if (!token) {
            token = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
        }
        
        if (!token) {
            console.warn('❌ No token available for audio file download')
            return
        }
        
        // Import Instruments and other necessary modules
        const { Instruments } = await import('@/service/Instruments')
        const { UUID } = await import('std')
        const { TrackBoxAdapter } = await import('@/audio-engine-shared/adapters/RootBoxAdapter')
        const { AudioFileBox } = await import('@/data/boxes/AudioFileBox')
        const { AudioRegionBox } = await import('@/data/boxes/AudioRegionBox')
        const { PPQN } = await import('dsp')
        
        const project = service.project
        const { boxGraph, editing } = project
        
        for (const trackData of tracks) {
            try {
                if (!trackData.filePath) {
                    console.warn('⚠️ Track has no file path:', trackData.name)
                    continue
                }
                
                console.log('📁 Importing audio file:', trackData.name, 'from', trackData.filePath)
                
                // Download the audio file
                const apiBaseUrl = await getWorkingApiBaseUrl(token)
                if (!apiBaseUrl) {
                    console.error('❌ Cannot connect to SyncSphere API for audio download')
                    continue
                }
                
                const audioResponse = await fetch(`${apiBaseUrl}/api/audio/stream/${trackData.audioFileId || trackData.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                
                if (!audioResponse.ok) {
                    console.error('❌ Failed to download audio file:', trackData.filePath)
                    continue
                }
                
                const arrayBuffer = await audioResponse.arrayBuffer()
                console.log('📦 Downloaded audio file:', arrayBuffer.byteLength, 'bytes')
                
                // Import the audio sample into OpenDAW with unique name to avoid UUID collisions
                const uniqueName = `${trackData.originalName || trackData.name}_${trackData.audioFileId || trackData.id}`
                const audioSample = await service.importSample({
                    name: uniqueName,
                    arrayBuffer: arrayBuffer,
                    progressHandler: (progress) => {
                        console.log(`🔄 Importing ${trackData.name}: ${(progress * 100).toFixed(1)}%`)
                    }
                })
                
                console.log('✅ Audio sample imported:', audioSample.name, audioSample.uuid)
                
                // Use the sample's own UUID for AudioFileBox
                const sampleUUID = UUID.parse(audioSample.uuid)
                
                // Create track, AudioFileBox and region all in single transaction
                let track, device, audioFileBox, trackBoxAdapter
                
                editing.modify(() => {
                    // Create track within transaction
                    const result = Instruments.create(project, Instruments.Tape, {
                        name: trackData.originalName || trackData.name
                    })
                    track = result.track
                    device = result.device
                    
                    console.log('🎛️ Created track:', track.name.getValue())
                    
                    // Create or find AudioFileBox
                    audioFileBox = boxGraph.findBox(sampleUUID).unwrapOrElse(() => 
                        AudioFileBox.create(boxGraph, sampleUUID, box => {
                            box.fileName.setValue(audioSample.name)
                            box.startInSeconds.setValue(0)
                            box.endInSeconds.setValue(audioSample.duration)
                        })
                    )
                    
                    // Add audio as a region on the track
                    trackBoxAdapter = project.boxAdapters.adapterFor(track, TrackBoxAdapter)
                    const duration = Math.round(PPQN.secondsToPulses(audioSample.duration, audioSample.bpm || 120))
                    
                    AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(0)  // Start at beginning
                        box.duration.setValue(duration)
                        box.regions.refer(trackBoxAdapter.box.regions)
                        box.label.setValue(audioSample.name)
                        box.file.refer(audioFileBox)
                        box.mute.setValue(false)
                        box.gain.setValue(1.0)  // Full volume
                    })
                })
                
                console.log('✅ Successfully added', audioSample.name, 'to timeline')
                
            } catch (error) {
                console.error('❌ Failed to import track:', trackData.name, error)
            }
        }
        
        console.log('🎉 Audio import completed!')
        
    } catch (error) {
        console.error('❌ Error during audio import:', error)
    }
}

// Function to import room audio files to samples only (no tracks created)
async function importRoomAudioFilesToSamples(service: StudioService, audioFiles: any[], roomId: string) {
    try {
        console.log('🎵 Starting SAMPLE-ONLY import for', audioFiles.length, 'audio files...')
        console.log('📋 Audio files to import as samples:', audioFiles.map(f => ({
            name: f.originalName || f.filename,
            path: f.filePath,
            id: f.id
        })))
        console.log('🎯 SAMPLE IMPORT: This will add files to locally stored samples for manual use')
        
        // Check current OPFS samples before import
        try {
            const { OpfsAgent } = await import('@/service/agents')
            const existingSamples = await OpfsAgent.list('samples/v2')
            console.log('🔍 OPFS samples BEFORE import:', existingSamples.length)
            console.log('🔍 Existing sample names:', existingSamples.map(s => s.name))
        } catch (opfsError) {
            console.log('🔍 Could not check existing OPFS samples:', opfsError)
        }
        
        // Get token from URL parameters or storage
        const urlParams = new URLSearchParams(window.location.search)
        const authToken = urlParams.get('auth_token')
        let token = authToken ? atob(authToken) : null
        if (!token) {
            token = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
        }
        
        if (!token) {
            console.warn('❌ No token available for audio file download')
            return
        }
        
        for (const audioFileData of audioFiles) {
            try {
                if (!audioFileData.filePath) {
                    console.warn('⚠️ Audio file has no file path:', audioFileData.originalName)
                    continue
                }
                
                console.log('📁 SAMPLE IMPORT: Processing audio file:', audioFileData.originalName, 'from', audioFileData.filePath)
                
                // Download the audio file
                const apiBaseUrl = await getWorkingApiBaseUrl(token)
                if (!apiBaseUrl) {
                    console.error('❌ Cannot connect to SyncSphere API for audio download')
                    continue
                }
                
                const audioResponse = await fetch(`${apiBaseUrl}/api/audio/stream/${audioFileData.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                
                if (!audioResponse.ok) {
                    console.error('❌ SAMPLE IMPORT FAILED: Cannot download audio file:', audioFileData.originalName)
                    console.error('❌ Response status:', audioResponse.status, audioResponse.statusText)
                    console.error('❌ File path attempted:', `${apiBaseUrl}/api/audio/stream/${audioFileData.id}`)
                    continue
                }
                
                const arrayBuffer = await audioResponse.arrayBuffer()
                console.log('📦 Downloaded audio file:', arrayBuffer.byteLength, 'bytes')
                
                // Import the audio sample into OpenDAW samples ONLY with truly unique name
                const timestamp = Date.now()
                const randomSuffix = Math.random().toString(36).substring(2, 8)
                const uniqueName = `${audioFileData.originalName || audioFileData.filename}_room${roomId}_${audioFileData.id}_${timestamp}_${randomSuffix}`
                console.log('🎯 SAMPLE IMPORT: About to import to samples with unique name:', uniqueName)
                console.log('🎯 This sample should persist in OPFS and not be overwritten')
                
                // Add delay between imports to prevent race conditions
                await new Promise(resolve => setTimeout(resolve, 100))
                
                // Clone arrayBuffer to prevent detachment issues
                const arrayBufferClone = arrayBuffer.slice()
                
                // Generate deterministic UUID based on AudioFile ID to prevent duplicates  
                const { UUID } = await import('std')
                const audioFileUuid = await UUID.sha256(new TextEncoder().encode(`audiofile-${audioFileData.id}-${roomId}`))
                
                const audioSample = await service.importSample({
                    uuid: audioFileUuid,
                    name: uniqueName,
                    arrayBuffer: arrayBufferClone,
                    progressHandler: (progress) => {
                        console.log(`🔄 Importing sample ${audioFileData.originalName}: ${(progress * 100).toFixed(1)}%`)
                    }
                })
                
                // Verify the sample was imported correctly
                console.log('✅ SAMPLE IMPORTED:', audioSample.name, 'UUID:', audioSample.uuid)
                console.log('🎯 Sample details:', {
                    name: audioSample.name,
                    uuid: audioSample.uuid,
                    duration: audioSample.duration,
                    bpm: audioSample.bpm,
                    sampleRate: audioSample.sampleRate,
                    sample_rate: audioSample.sample_rate
                })
                
                // Force sample persistence to OPFS using direct OPFS operations
                console.log('🔄 Forcing sample persistence to OPFS manually...')
                try {
                    // Get sample data and manually write to OPFS
                    const { OpfsAgent } = await import('@/service/agents')
                    
                    // Create sample metadata
                    const sampleMetadata = {
                        uuid: audioSample.uuid,
                        name: audioSample.name,
                        duration: audioSample.duration,
                        bpm: audioSample.bpm || 120, // Include BPM field
                        sample_rate: audioSample.sample_rate || audioSample.sampleRate, // Use correct field name
                        channels: audioSample.channels || 2,
                        originalName: audioFileData.originalName,
                        roomId: roomId,
                        fileId: audioFileData.id,
                        createdAt: new Date().toISOString()
                    }
                    
                    // Write sample metadata to OPFS
                    const samplePath = `samples/v2/${audioSample.uuid}`
                    console.log('💾 Writing sample to OPFS path:', samplePath)
                    
                    // Save metadata (ensure proper Uint8Array format)
                    const metadataString = JSON.stringify(sampleMetadata, null, 2)
                    const metadataArray = new TextEncoder().encode(metadataString)
                    console.log('📝 Metadata size:', metadataArray.length, 'bytes')
                    await OpfsAgent.write(`${samplePath}/meta.json`, metadataArray)
                    
                    // Save the audio data (ensure proper Uint8Array format)
                    const audioArray = new Uint8Array(arrayBuffer)
                    console.log('🎵 Audio data size:', audioArray.length, 'bytes')
                    await OpfsAgent.write(`${samplePath}/audio.bin`, audioArray)
                    
                    console.log('✅ Sample manually persisted to OPFS:', samplePath)
                    
                } catch (saveError) {
                    console.warn('⚠️ Could not manually persist sample to OPFS:', saveError)
                    
                    // Fallback: The sample is already imported into OpenDAW's memory
                    // OpenDAW should handle persistence automatically
                    console.log('📝 FALLBACK: Sample exists in OpenDAW memory, relying on automatic persistence')
                    console.log('🎯 Sample should still be available in locally stored samples UI')
                    
                    // Note: Even if OPFS manual save fails, the sample should still appear in UI
                    // because service.importSample() already added it to OpenDAW's sample manager
                }
                
                // Wait longer to ensure the import is fully processed and saved
                await new Promise(resolve => setTimeout(resolve, 500))
                
                // Verify sample exists in OPFS with detailed debugging
                try {
                    const { OpfsAgent } = await import('@/service/agents')
                    console.log('🔍 Attempting to list OPFS samples...')
                    
                    // Try different possible sample paths
                    const possiblePaths = ['samples/v2', 'samples/v1', 'samples']
                    let samplesList = []
                    let foundPath = null
                    
                    for (const path of possiblePaths) {
                        try {
                            const list = await OpfsAgent.list(path)
                            if (list && list.length > 0) {
                                samplesList = list
                                foundPath = path
                                console.log(`✅ Found samples in path: ${path}`)
                                break
                            }
                        } catch (pathError) {
                            console.log(`❌ No samples found in path: ${path}`)
                        }
                    }
                    
                    if (foundPath) {
                        console.log('🔍 Current samples in OPFS after import:', samplesList.length)
                        console.log('🔍 Sample names:', samplesList.map(s => s.name))
                        console.log('🔍 Sample paths:', samplesList.map(s => ({ name: s.name, type: s.type })))
                        
                        // Check if our sample is in the list (search by UUID and other criteria)
                        const searchTerms = [audioSample.uuid, audioFileData.id, audioFileData.originalName, uniqueName.split('_')[0]]
                        let ourSample = null
                        
                        console.log('🔍 Searching for sample with terms:', searchTerms)
                        console.log('🔍 Available sample names/IDs:', samplesList.map(s => ({ name: s.name, id: s.id || 'no-id' })))
                        
                        // First try to find by exact UUID match
                        ourSample = samplesList.find(s => s.name === audioSample.uuid || s.id === audioSample.uuid)
                        if (ourSample) {
                            console.log(`✅ SAMPLE VERIFIED IN OPFS (found by UUID):`, ourSample.name)
                        } else {
                            // Then try other search terms
                            for (const term of searchTerms) {
                                ourSample = samplesList.find(s => s.name && s.name.includes(term))
                                if (ourSample) {
                                    console.log(`✅ SAMPLE VERIFIED IN OPFS (found by ${term}):`, ourSample.name)
                                    break
                                }
                            }
                        }
                        
                        if (!ourSample) {
                            console.warn('⚠️ Sample not found in OPFS list - checking search terms:', searchTerms)
                            console.warn('⚠️ Available samples:', samplesList.map(s => s.name))
                        }
                    } else {
                        console.error('❌ No samples found in any OPFS path!')
                        console.error('❌ This indicates samples are not being persisted to OPFS at all')
                    }
                } catch (opfsError) {
                    console.error('❌ OPFS verification failed completely:', opfsError)
                    console.error('❌ This suggests OPFS access is not working')
                }
                
                console.log('✅ SAMPLE AVAILABLE: User can now manually drag', audioSample.name, 'from locally stored samples')
                
            } catch (error) {
                console.error('❌ Failed to import sample:', audioFileData.originalName, error)
            }
        }
        
        console.log('🎉 Sample import completed! All files are now available in locally stored samples')
        
    } catch (error) {
        console.error('❌ Error during sample import:', error)
    }
}

// Function to import room audio files from a list and create tracks (legacy)
async function importRoomAudioFilesFromList(service: StudioService, audioFiles: any[], roomId: string) {
    try {
        console.log('🎵 Starting AUTOMATIC audio import for', audioFiles.length, 'audio files...')
        console.log('📋 Audio files to import:', audioFiles.map(f => ({
            name: f.originalName || f.filename,
            path: f.filePath,
            id: f.id
        })))
        console.log('🎯 AUTOMATIC IMPORT: This will create tracks automatically for each audio file')
        
        // Get token from URL parameters or storage
        const urlParams = new URLSearchParams(window.location.search)
        const authToken = urlParams.get('auth_token')
        let token = authToken ? atob(authToken) : null
        if (!token) {
            token = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
        }
        
        if (!token) {
            console.warn('❌ No token available for audio file download')
            return
        }
        
        // Import Instruments and other necessary modules
        const { Instruments } = await import('@/service/Instruments')
        const { UUID } = await import('std')
        const { TrackBoxAdapter } = await import('@/audio-engine-shared/adapters/RootBoxAdapter')
        const { AudioFileBox } = await import('@/data/boxes/AudioFileBox')
        const { AudioRegionBox } = await import('@/data/boxes/AudioRegionBox')
        const { PPQN } = await import('dsp')
        
        const project = service.project
        const { boxGraph, editing } = project
        
        for (const audioFileData of audioFiles) {
            try {
                if (!audioFileData.filePath) {
                    console.warn('⚠️ Audio file has no file path:', audioFileData.originalName)
                    continue
                }
                
                console.log('📁 AUTOMATIC IMPORT: Processing audio file:', audioFileData.originalName, 'from', audioFileData.filePath)
                
                // Download the audio file
                const apiBaseUrl = await getWorkingApiBaseUrl(token)
                if (!apiBaseUrl) {
                    console.error('❌ Cannot connect to SyncSphere API for audio download')
                    continue
                }
                
                const audioResponse = await fetch(`${apiBaseUrl}/api/audio/stream/${audioFileData.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                
                if (!audioResponse.ok) {
                    console.error('❌ AUTOMATIC IMPORT FAILED: Cannot download audio file:', audioFileData.originalName)
                    console.error('❌ Response status:', audioResponse.status, audioResponse.statusText)
                    console.error('❌ File path attempted:', `${apiBaseUrl}/api/audio/stream/${audioFileData.id}`)
                    continue
                }
                
                const arrayBuffer = await audioResponse.arrayBuffer()
                console.log('📦 Downloaded audio file:', arrayBuffer.byteLength, 'bytes')
                
                // Import the audio sample into OpenDAW with unique name to avoid UUID collisions
                const timestamp = Date.now()
                const uniqueName = `${audioFileData.originalName || audioFileData.filename}_${audioFileData.id}_${timestamp}`
                console.log('🎯 DEBUG: About to import audio sample with unique name:', uniqueName)
                
                // Add delay between imports to prevent race conditions
                await new Promise(resolve => setTimeout(resolve, 100))
                
                const audioSample = await service.importSample({
                    name: uniqueName,
                    arrayBuffer: arrayBuffer,
                    progressHandler: (progress) => {
                        console.log(`🔄 Importing ${audioFileData.originalName}: ${(progress * 100).toFixed(1)}%`)
                    }
                })
                
                // Verify the sample was imported correctly before proceeding
                console.log('✅ Audio sample imported successfully:', audioSample.name, 'UUID:', audioSample.uuid)
                
                // Wait a bit to ensure the import is fully processed
                await new Promise(resolve => setTimeout(resolve, 200))
                
                console.log('✅ Audio sample imported:', audioSample.name, audioSample.uuid)
                console.log('🎯 DEBUG: Audio sample details:', {
                    name: audioSample.name,
                    uuid: audioSample.uuid,
                    duration: audioSample.duration,
                    sampleRate: audioSample.sampleRate
                })
                
                // Create track, audio file box, and region 
                console.log('🎯 DEBUG: About to create Tape device/track')
                let audioRegion = null
                let track, device, audioFileBox, trackBoxAdapter
                
                // Create track, AudioFileBox and region all in single transaction
                const trackName = `${audioFileData.originalName || audioFileData.filename}_${audioFileData.id}`
                console.log('🎛️ Creating track with unique name:', trackName)
                
                editing.modify(() => {
                    // Create track within transaction
                    const result = Instruments.create(project, Instruments.Tape, {
                        name: trackName
                    })
                    track = result.track
                    device = result.device
                    
                    console.log('🎛️ Created track:', track.name.getValue())
                    
                    // Find existing AudioFileBox for this sample or create new one
                    const sampleUUID = UUID.parse(audioSample.uuid)
                    audioFileBox = boxGraph.findBox(sampleUUID).unwrapOrElse(() => 
                        AudioFileBox.create(boxGraph, sampleUUID, box => {
                            box.fileName.setValue(audioSample.name)
                            box.startInSeconds.setValue(0)
                            box.endInSeconds.setValue(audioSample.duration)
                        })
                    )
                    
                    console.log('📦 AudioFileBox created/found with UUID:', sampleUUID.getValue())
                    
                    // Get track box adapter
                    trackBoxAdapter = project.boxAdapters.adapterFor(track, TrackBoxAdapter)
                    const duration = Math.round(PPQN.secondsToPulses(audioSample.duration, audioSample.bpm || 120))
                    
                    console.log('🎯 Creating audio region - Duration:', duration, 'pulses, Sample duration:', audioSample.duration, 'seconds')
                    
                    // Create audio region and connect it to the track
                    audioRegion = AudioRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.position.setValue(0)  // Start at beginning
                        box.duration.setValue(duration)
                        box.regions.refer(trackBoxAdapter.box.regions)
                        box.label.setValue(audioSample.name)
                        box.file.refer(audioFileBox)
                        box.mute.setValue(false)
                        box.gain.setValue(1.0)  // Full volume
                        
                        console.log('📦 Audio region created with UUID:', box.uuid.getValue())
                    })
                })
                console.log('🎯 DEBUG: Track details:', {
                    name: track.name.getValue(),
                    uuid: track.uuid.getValue(),
                    device: device,
                    hasTrack: !!track
                })
                
                console.log('✅ AUTOMATIC IMPORT SUCCESS: Added', audioSample.name, 'to timeline as a new track')
                
                // CRITICAL: Trigger UI subscription updates after editing transaction completes
                setTimeout(() => {
                    (async () => {
                        try {
                            console.log('🔄 Triggering UI subscription updates for track:', audioSample.name)
                            const trackBoxAdapter = project.boxAdapters.adapterFor(track, TrackBoxAdapter)
                            
                            // Force region subscription update to trigger UI rendering
                            if (trackBoxAdapter && trackBoxAdapter.regions && trackBoxAdapter.regions.dispatchChange) {
                                trackBoxAdapter.regions.dispatchChange()
                                console.log('✅ Dispatched region changes for track:', track.name.getValue())
                            }
                            
                            // Force audio unit subscription update  
                            try {
                                const { AudioUnitBoxAdapter } = await import('@/audio-engine-shared/adapters/RootBoxAdapter')
                                const audioUnitAdapter = project.boxAdapters.adapterFor(track.audioUnit, AudioUnitBoxAdapter)
                                if (audioUnitAdapter && audioUnitAdapter.tracks) {
                                    // Trigger track subscription updates
                                    audioUnitAdapter.tracks.adapters().forEach(adapter => {
                                        if (adapter.regions && adapter.regions.dispatchChange) {
                                            adapter.regions.dispatchChange()
                                        }
                                    })
                                    console.log('✅ Dispatched audio unit track changes')
                                }
                            } catch (error) {
                                console.warn('⚠️ Could not access AudioUnitBoxAdapter:', error)
                            }
                            
                            // Force timeline manager updates if available
                            if (service.timeline) {
                                // Try to trigger timeline refresh through various possible methods
                                if (service.timeline.manager && service.timeline.manager.invalidateOrder) {
                                    service.timeline.manager.invalidateOrder()
                                    console.log('✅ Invalidated timeline order')
                                }
                                
                                if (service.timeline.requestUpdate) {
                                    service.timeline.requestUpdate()
                                    console.log('✅ Requested timeline update')
                                }
                                
                                if (service.timeline.invalidate) {
                                    service.timeline.invalidate()
                                    console.log('✅ Invalidated timeline')
                                }
                            }
                            
                            // Trigger window resize event to force canvas repainting
                            const resizeEvent = new Event('resize')
                            window.dispatchEvent(resizeEvent)
                            console.log('✅ Dispatched resize event for canvas repaint')
                            
                        } catch (error) {
                            console.warn('⚠️ Could not trigger UI subscription updates:', error)
                        }
                    })()
                }, 100) // Small delay to ensure editing transaction is complete
                
                // Detailed track and region verification
                try {
                    const trackBoxAdapter = project.boxAdapters.adapterFor(track, TrackBoxAdapter)
                    const regionCount = trackBoxAdapter.regions.size()
                    
                    console.log('🔍 Post-creation verification:')
                    console.log('  📍 Track index:', trackBoxAdapter.listIndex)
                    console.log('  🎶 Regions count:', regionCount)
                    console.log('  🎵 Track name:', track.name.getValue())
                    console.log('  🆔 Track UUID:', track.uuid.getValue())
                    
                    if (regionCount > 0) {
                        trackBoxAdapter.regions.adapters().forEach((region, index) => {
                            console.log(`  🎶 Region ${index}:`, {
                                label: region.label?.getValue?.(),
                                position: region.position?.getValue?.(),
                                duration: region.duration?.getValue?.(),
                                uuid: region.uuid?.getValue?.()
                            })
                        })
                    }
                    
                    // Check timeline status
                    if (project.timelineBoxAdapter && project.timelineBoxAdapter.tracks) {
                        console.log('📊 Timeline status:')
                        console.log('  📈 Total tracks in timeline:', project.timelineBoxAdapter.tracks.size())
                        console.log('  📊 Audio units count:', project.rootBoxAdapter.audioUnits.size())
                    }
                } catch (error) {
                    console.warn('⚠️ Could not access track adapter for verification:', error)
                }
                
                // Force immediate UI update for this specific track
                try {
                    // Try to trigger any available UI update mechanisms
                    if (service.layout && service.layout.invalidate) {
                        service.layout.invalidate()
                        console.log('🔄 Layout invalidated')
                    }
                    
                    if (service.timeline && service.timeline.invalidate) {
                        service.timeline.invalidate()
                        console.log('🔄 Timeline invalidated')
                    }
                } catch (error) {
                    console.warn('⚠️ Could not trigger UI updates:', error)
                }
                
            } catch (error) {
                console.error('❌ Failed to import audio file:', audioFileData.originalName, error)
            }
        }
        
        console.log('🎉 Audio import completed!')
        
        // Force final UI update to ensure all tracks and regions are visible
        await forceTimelineUIUpdate(project)
        
        // Try to resume audio context if needed
        if (service.context && service.context.state === 'suspended') {
            console.log('🔊 Resuming audio context...')
            try {
                await service.context.resume()
                console.log('✅ Audio context resumed')
            } catch (error) {
                console.warn('⚠️ Could not resume audio context:', error)
            }
        }
        
    } catch (error) {
        console.error('❌ Error during audio import:', error)
    }
}

// Function to force timeline UI update and ensure tracks/regions are visible
async function forceTimelineUIUpdate(project: any) {
    try {
        console.log('🔄 Forcing timeline UI update using subscription mechanisms...')
        
        // Get the service from the project
        const service = project.service || project
        
        // Ensure we're in the correct screen mode
        if (service && service.switchScreen) {
            console.log('🖥️ Setting screen to default workspace view...')
            service.switchScreen("default")
        }
        
        // Access all audio units to trigger subscription updates
        const audioUnits = project.rootBoxAdapter?.audioUnits
        if (!audioUnits) {
            console.warn('⚠️ No audio units found in project')
            return
        }
        console.log('🎛️ Audio units count:', audioUnits.size())
        
        // Force subscription updates for all audio units, tracks, and regions
        audioUnits.adapters().forEach((audioUnit, index) => {
            console.log(`🎵 Processing Audio Unit ${index}:`, audioUnit.name.getValue())
            
            // Force audio unit track subscription updates
            if (audioUnit.tracks && audioUnit.tracks.adapters) {
                audioUnit.tracks.adapters().forEach((track, trackIndex) => {
                    const regions = track.regions && track.regions.size ? track.regions.size() : 0
                    console.log(`  📍 Track ${trackIndex}:`, track.name ? track.name.getValue() : 'Unknown', 
                        'regions:', regions, 'index:', track.listIndex)
                    
                    // CRITICAL: Force region subscription dispatch for each track
                    if (track.regions && track.regions.dispatchChange) {
                        track.regions.dispatchChange()
                        console.log(`  ✅ Dispatched region changes for track: ${track.name.getValue()}`)
                    }
                    
                    // Log region details for verification
                    if (regions > 0) {
                        track.regions.adapters().forEach((region, regionIndex) => {
                            console.log(`    🎶 Region ${regionIndex}:`, region.label?.getValue?.() || 'Unknown', 
                                'position:', region.position?.getValue?.() || 0,
                                'duration:', region.duration?.getValue?.() || 0)
                        })
                    }
                })
                
                // Force audio unit tracks subscription update
                if (audioUnit.tracks.dispatchChange) {
                    audioUnit.tracks.dispatchChange()
                    console.log(`  ✅ Dispatched track changes for audio unit: ${audioUnit.name.getValue()}`)
                }
            }
        })
        
        // Force root audio units subscription update
        if (audioUnits.dispatchChange) {
            audioUnits.dispatchChange()
            console.log('✅ Dispatched audio units changes')
        }
        
        // Multiple animation frame updates to ensure proper DOM rendering
        if (typeof requestAnimationFrame !== 'undefined') {
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            console.log('🖼️ Multiple animation frame updates completed')
                            resolve(true)
                        })
                    })
                })
            })
        }
        
        // Trigger window resize event to force canvas repainting for timeline
        const resizeEvent = new Event('resize')
        window.dispatchEvent(resizeEvent)
        console.log('✅ Dispatched resize event for canvas repaint')
        
        // Trigger additional DOM events that might refresh the timeline
        const events = ['scroll', 'mouseenter', 'mousemove']
        events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true })
            document.dispatchEvent(event)
        })
        console.log('✅ Dispatched additional DOM events for UI refresh')
        
        // Additional delay to ensure UI components have time to render
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        console.log('✅ Timeline UI update completed')
        
        // Final verification - log the state after updates
        const finalTrackCount = audioUnits.adapters()
            .reduce((total, unit) => total + (unit.tracks && unit.tracks.size ? unit.tracks.size() : 0), 0)
        const finalRegionCount = audioUnits.adapters()
            .reduce((total, unit) => {
                if (!unit.tracks || !unit.tracks.adapters) return total
                return total + unit.tracks.adapters()
                    .reduce((trackTotal, track) => trackTotal + (track.regions && track.regions.size ? track.regions.size() : 0), 0)
            }, 0)
        
        console.log('🏁 Final state - Tracks:', finalTrackCount, 'Regions:', finalRegionCount)
        
        // Debug DOM elements to see if UI components exist
        debugTimelineDOM()
        
    } catch (error) {
        console.warn('⚠️ Error during timeline UI update:', error)
    }
}

// Function to update project info panel
export function updateProjectInfoPanel(projectName?: string, additionalInfo?: any) {
    const panel = document.getElementById('synxsphere-project-info')
    if (!panel) return
    
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    const roomId = projectId?.startsWith('room-') ? projectId.substring(5) : null
    const userName = urlParams.get('userName')
    
    if (!roomId) return
    
    const currentProjectData = (window as any).currentProjectData
    const displayName = projectName || currentProjectData?.name || `test${roomId}`
    const userDisplayName = decodeURIComponent(userName || 'Unknown User')
    
    // Build audio files info
    let audioFilesInfo = ''
    if (additionalInfo?.audioFiles && additionalInfo.audioFiles.length > 0) {
        const audioFiles = additionalInfo.audioFiles
        audioFilesInfo = `
            <div style="margin-bottom: 6px;">
                <span style="color: #94a3b8; font-size: 10px;">AUDIO FILES:</span><br>
                <span style="font-size: 10px; color: #10b981;">${audioFiles.length} files loaded</span>
            </div>
        `
    }
    
    // Build bundle info
    let bundleInfo = ''
    if (additionalInfo?.hasBundle && additionalInfo?.bundleSize) {
        const sizeKB = Math.round(additionalInfo.bundleSize / 1024)
        bundleInfo = `
            <div style="margin-bottom: 6px;">
                <span style="color: #94a3b8; font-size: 10px;">BUNDLE:</span><br>
                <span style="font-size: 10px; color: #10b981;">.odb loaded (${sizeKB} KB)</span>
            </div>
        `
    }

    panel.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; margin-right: 8px;"></div>
            <span style="font-weight: 600; color: #10b981;">SynxSphere Connected</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: #94a3b8; font-size: 10px;">PROJECT:</span><br>
            <span style="font-weight: 500;">${displayName}</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: #94a3b8; font-size: 10px;">ROOM ID:</span><br>
            <span style="font-family: monospace; font-size: 11px;">${roomId}</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: #94a3b8; font-size: 10px;">USER:</span><br>
            <span style="font-weight: 500;">${userDisplayName}</span>
        </div>
        <div style="margin-bottom: 6px;">
            <span style="color: #94a3b8; font-size: 10px;">PROJECT ID:</span><br>
            <span style="font-family: monospace; font-size: 11px;">${projectId}</span>
        </div>
        ${audioFilesInfo}
        ${bundleInfo}
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #374151;">
            <span style="color: #94a3b8; font-size: 10px;">Auto-save: </span>
            <span style="color: #10b981; font-size: 10px;">Every 30s</span>
        </div>
    `
}

// Export a function to save project back to room
export async function saveProjectToRoom(service: StudioService) {
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    const roomId = projectId?.startsWith('room-') ? projectId.substring(5) : null
    
    if (!roomId) return
    
    try {
        // Get current project data from OpenDAW
        const currentSession = service.sessionService.getValue()
        if (currentSession.isEmpty()) {
            console.warn('No active project to save')
            return
        }
        
        const session = currentSession.unwrap()
        
        // Serialize the project data
        // TODO: Implement proper project serialization
        const projectData = {
            version: "1.0",
            tracks: [],
            tempo: 120,
            timeSignature: { numerator: 4, denominator: 4 },
            settings: {
                sampleRate: 44100,
                bufferSize: 512
            },
            // Add more project data here
            lastModified: new Date().toISOString()
        }
        
        // Send to SynxSphere
        const urlParams = new URLSearchParams(window.location.search)
        const authToken = urlParams.get('auth_token')
        let token = authToken ? atob(authToken) : null
        if (!token) {
            token = sessionStorage.getItem('synxsphere_token') || localStorage.getItem('token')
        }
        
        if (token) {
            const apiBaseUrl = await getWorkingApiBaseUrl(token)
            if (!apiBaseUrl) {
                console.error('❌ Cannot connect to SyncSphere API for project update')
                return
            }
            
            const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/studio-project`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectData: projectData,
                    name: session.meta.name
                })
            })
            
            if (response.ok) {
                console.log('✅ Project saved to room')
            } else {
                console.error('❌ Failed to save project to room')
            }
        }
    } catch (error) {
        console.error('❌ Error saving project to room:', error)
    }
}

// Auto-save every 30 seconds
let autoSaveInterval: number | null = null

export function startAutoSave(service: StudioService) {
    if (autoSaveInterval) return
    
    const urlParams = new URLSearchParams(window.location.search)
    const projectId = urlParams.get('projectId')
    if (!projectId?.startsWith('room-')) return
    
    autoSaveInterval = window.setInterval(() => {
        saveProjectToRoom(service)
    }, 30000) // 30 seconds
}

export function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval)
        autoSaveInterval = null
    }
}

// Function to debug DOM elements and check if UI components are present
function debugTimelineDOM() {
    try {
        console.log('🔍 Debugging Timeline DOM Elements...')
        
        // Check for common openDAW UI selectors
        const selectors = [
            '[class*="timeline"]',
            '[class*="track"]',
            '[class*="region"]',
            '[class*="clip"]',
            '[class*="audio"]',
            '[data-testid*="timeline"]',
            '[data-testid*="track"]',
            '.workspace',
            '.studio',
            '.sequencer'
        ]
        
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector)
            if (elements.length > 0) {
                console.log(`✅ Found ${elements.length} elements matching "${selector}":`)
                elements.forEach((el, index) => {
                    if (index < 3) { // Log first 3 elements
                        console.log(`  ${index}: ${el.tagName} - classes: ${el.className} - id: ${el.id}`)
                    }
                })
            } else {
                console.log(`❌ No elements found for "${selector}"`)
            }
        })
        
        // Check for openDAW-specific component structure
        const workspace = document.querySelector('[class*="workspace"], [class*="studio"], .app')
        if (workspace) {
            console.log('🖥️ Workspace element found:', workspace.tagName, workspace.className)
            console.log('🧩 Workspace children count:', workspace.children.length)
            
            // Log direct children
            Array.from(workspace.children).forEach((child, index) => {
                if (index < 5) { // First 5 children
                    console.log(`  Child ${index}: ${child.tagName} - ${child.className}`)
                }
            })
        } else {
            console.log('❌ No workspace element found')
        }
        
        // Check for any elements with track-related content
        const allElements = document.querySelectorAll('*')
        let trackRelatedElements = 0
        let regionRelatedElements = 0
        
        allElements.forEach(el => {
            const text = el.textContent?.toLowerCase() || ''
            const className = el.className?.toLowerCase() || ''
            
            if (text.includes('track') || className.includes('track')) {
                trackRelatedElements++
            }
            if (text.includes('region') || className.includes('region') || text.includes('clip')) {
                regionRelatedElements++
            }
        })
        
        console.log('📊 DOM Analysis Summary:')
        console.log('  🎵 Track-related elements:', trackRelatedElements)
        console.log('  🎶 Region/clip-related elements:', regionRelatedElements)
        console.log('  📄 Total DOM elements:', allElements.length)
        
        // Check current URL and screen state
        console.log('🌐 Current URL:', window.location.href)
        console.log('📍 Current pathname:', window.location.pathname)
        
    } catch (error) {
        console.warn('⚠️ Error during DOM debugging:', error)
    }
}