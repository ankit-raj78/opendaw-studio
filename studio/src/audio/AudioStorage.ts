import {AudioData} from "@/audio/AudioData"
import {AudioMetaData} from "@/audio/AudioMetaData"
import {OpfsAgent} from "@/service/agents"
import {ByteArrayInput, EmptyExec, UUID} from "std"
import {Peaks} from "fusion"
import {AudioSample} from "@/audio/AudioSample"
import {encodeWavFloat} from "@/wav"

export namespace AudioStorage {
    // CAUTION! Next time you would kill all locally imported files, so it is not that easy!
    export const clean = async () => {
        try {
            // Check if the folder exists by trying to list it
            await OpfsAgent.list(Folder)
            console.log(`📁 OPFS Clean: Folder ${Folder} exists, proceeding with cleanup`)
            
            // Only delete if folder exists and list succeeded
            try {
                await OpfsAgent.delete(Folder)
                console.log(`✅ OPFS Clean: Successfully deleted folder ${Folder}`)
            } catch (deleteError) {
                if (deleteError.name === 'NotFoundError') {
                    console.log(`📁 OPFS Clean: Folder ${Folder} already deleted during cleanup`)
                } else {
                    console.error(`❌ OPFS Clean: Failed to delete folder ${Folder}:`, deleteError)
                    throw deleteError
                }
            }
        } catch (listError) {
            // Folder doesn't exist - this is expected and fine
            if (listError.name === 'NotFoundError') {
                console.log(`📁 OPFS Clean: Folder ${Folder} does not exist, cleanup not needed`)
            } else {
                console.error(`❌ OPFS Clean: Error checking folder ${Folder}:`, listError)
                // Don't throw - we don't want to break app startup for cleanup issues
            }
        }
    }

    export const Folder = "samples/v2"
    
    // Room-specific storage methods
    export const getRoomFolder = (roomId: string) => `${Folder}/room-${roomId}`
    
    export const cleanRoom = (roomId: string) => OpfsAgent.delete(getRoomFolder(roomId)).catch(EmptyExec)

    export const store = async (uuid: UUID.Format,
                                audio: AudioData,
                                peaks: ArrayBuffer,
                                meta: AudioMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            OpfsAgent.write(`${path}/audio.wav`, new Uint8Array(encodeWavFloat({
                channels: audio.frames.slice(),
                numFrames: audio.numberOfFrames,
                sampleRate: audio.sampleRate
            }))),
            OpfsAgent.write(`${path}/peaks.bin`, new Uint8Array(peaks)),
            OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
        ]).then(EmptyExec)
    }

    export const updateMeta = async (uuid: UUID.Format, meta: AudioMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }

    export const load = async (uuid: UUID.Format, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData]> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return Promise.all([
            OpfsAgent.read(`${path}/audio.wav`)
                .then(bytes => context.decodeAudioData(bytes.buffer as ArrayBuffer)),
            OpfsAgent.read(`${path}/peaks.bin`)
                .then(bytes => Peaks.from(new ByteArrayInput(bytes.buffer))),
            OpfsAgent.read(`${path}/meta.json`)
                .then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
        ]).then(([buffer, peaks, meta]) => [AudioData.from(buffer), peaks, meta])
    }

    export const remove = async (uuid: UUID.Format): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return OpfsAgent.delete(`${path}`)
    }

    export const list = async (): Promise<ReadonlyArray<AudioSample>> => {
        return OpfsAgent.list(Folder)
            .then(files => Promise.all(files.filter(file => file.kind === "directory")
                .map(async ({name}) => {
                    const array = await OpfsAgent.read(`${Folder}/${name}/meta.json`)
                    return ({uuid: name, ...(JSON.parse(new TextDecoder().decode(array)) as AudioMetaData)})
                })), () => [])
    }

    // Ensure room folder exists by creating the directory structure step by step
    export const ensureRoomFolderExists = async (roomId: string): Promise<void> => {
        try {
            const roomFolder = getRoomFolder(roomId)
            console.log(`📁 OPFS: Checking room ${roomId} folder: ${roomFolder}`)
            
            // Try to list the room folder first
            console.log(`📁 OPFS: Attempting to list room folder...`)
            const files = await OpfsAgent.list(roomFolder)
            console.log(`✅ OPFS: Room ${roomId} folder already exists with ${files.length} items`)
        } catch (error) {
            console.log(`📁 OPFS: Room ${roomId} folder does not exist, creating...`)
            console.log(`📁 OPFS: List error was:`, {
                name: error.name,
                message: error.message
            })
            
            try {
                // Create directory structure step by step
                // First ensure base samples folder exists
                console.log(`📁 OPFS: Step 1 - Checking base samples folder: ${Folder}`)
                try {
                    const baseFiles = await OpfsAgent.list(Folder)
                    console.log(`✅ OPFS: Base samples folder ${Folder} exists with ${baseFiles.length} items`)
                } catch (baseError) {
                    console.log(`📁 OPFS: Creating base samples folder: ${Folder}`)
                    console.log(`📁 OPFS: Base folder error was:`, {
                        name: baseError.name,
                        message: baseError.message
                    })
                    
                    console.log(`📁 OPFS: Writing temp file to create base folder...`)
                    await OpfsAgent.write(`${Folder}/.temp`, new Uint8Array([0]))
                    console.log(`📁 OPFS: Deleting temp file...`)
                    await OpfsAgent.delete(`${Folder}/.temp`)
                    console.log(`✅ OPFS: Base samples folder ${Folder} created`)
                }
                
                // Now create room folder
                const roomFolder = getRoomFolder(roomId)
                console.log(`📁 OPFS: Step 2 - Creating room folder: ${roomFolder}`)
                console.log(`📁 OPFS: Writing temp file to create room folder...`)
                await OpfsAgent.write(`${roomFolder}/.temp`, new Uint8Array([0]))
                console.log(`📁 OPFS: Deleting temp file from room folder...`)
                await OpfsAgent.delete(`${roomFolder}/.temp`)
                console.log(`✅ OPFS: Room ${roomId} folder created successfully`)
                
            } catch (createError) {
                console.error(`❌ OPFS: Failed to create room ${roomId} folder:`, createError)
                console.error(`❌ OPFS: Create error details:`, {
                    name: createError.name,
                    message: createError.message,
                    stack: createError.stack,
                    roomId: roomId,
                    roomFolder: getRoomFolder(roomId)
                })
                throw createError
            }
        }
    }

    // Room-specific storage methods
    export const storeInRoom = async (roomId: string, 
                                    uuid: UUID.Format,
                                    audio: AudioData,
                                    peaks: ArrayBuffer,
                                    meta: AudioMetaData): Promise<void> => {
        await ensureRoomFolderExists(roomId)
        const roomFolder = getRoomFolder(roomId)
        const path = `${roomFolder}/${UUID.toString(uuid)}`
        return Promise.all([
            OpfsAgent.write(`${path}/audio.wav`, new Uint8Array(encodeWavFloat({
                channels: audio.frames.slice(),
                numFrames: audio.numberOfFrames,
                sampleRate: audio.sampleRate
            }))),
            OpfsAgent.write(`${path}/peaks.bin`, new Uint8Array(peaks)),
            OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
        ]).then(EmptyExec)
    }

    export const loadFromRoom = async (roomId: string, uuid: UUID.Format, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData]> => {
        const roomFolder = getRoomFolder(roomId)
        const path = `${roomFolder}/${UUID.toString(uuid)}`
        const uuidString = UUID.toString(uuid)
        
        try {
            // Try to load from OPFS first
            const result = await Promise.all([
                OpfsAgent.read(`${path}/audio.wav`)
                    .then(bytes => context.decodeAudioData(bytes.buffer as ArrayBuffer)),
                OpfsAgent.read(`${path}/peaks.bin`)
                    .then(bytes => Peaks.from(new ByteArrayInput(bytes.buffer))),
                OpfsAgent.read(`${path}/meta.json`)
                    .then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
            ])
            
            console.log(`✅ LOAD-ROOM: Successfully loaded ${uuidString} from OPFS`)
            return [AudioData.from(result[0]), result[1], result[2]]
            
        } catch (opfsError) {
            console.warn(`⚠️ LOAD-ROOM: Failed to load ${uuidString} from OPFS, attempting database download...`)
            
            // Try to download and import from database
            try {
                const downloadedSample = await downloadSampleFromDatabase(roomId, uuidString, context)
                if (downloadedSample) {
                    console.log(`✅ LOAD-ROOM: Successfully downloaded and loaded ${uuidString} from database`)
                    return downloadedSample
                }
            } catch (downloadError) {
                console.error(`❌ LOAD-ROOM: Failed to download ${uuidString} from database:`, downloadError)
            }
            
            // If all else fails, throw the original OPFS error
            throw opfsError
        }
    }

    // Helper function to download sample from database and import to OPFS
    const downloadSampleFromDatabase = async (roomId: string, sampleUuid: string, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData] | null> => {
        try {
            // Get auth token using unified function
            const { token, source } = getAuthTokenForStorage()
            
            if (!token) {
                console.error(`❌ DOWNLOAD: No auth token found for sample ${sampleUuid} (source: ${source})`)
                return null
            }
            
            console.log(`🔄 DOWNLOAD: Using token from ${source}`)
            
            // Check if token is valid by length/format
            if (token.length < 10) {
                console.warn('⚠️ DOWNLOAD: Token appears too short, might be invalid')
            }
            
            // Determine API base URL
            let apiBaseUrl = 'http://localhost:8000' // SynxSphere main app
            try {
                const testResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'HEAD'
                })
                if (!testResponse.ok) {
                    apiBaseUrl = 'https://localhost:8443' // Collaboration proxy fallback
                    const fallbackResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                        headers: { 'Authorization': `Bearer ${token}` },
                        method: 'HEAD'
                    })
                    if (!fallbackResponse.ok) {
                        apiBaseUrl = 'http://localhost:3003' // Direct collaboration service
                    }
                }
            } catch {
                apiBaseUrl = 'http://localhost:3003' // Direct collaboration service fallback
            }
            
            console.log(`📡 DOWNLOAD: Fetching sample ${sampleUuid} from ${apiBaseUrl}`)
            
            // Download the audio file
            const response = await fetch(`${apiBaseUrl}/api/audio/stream/${sampleUuid}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            
            const arrayBuffer = await response.arrayBuffer()
            console.log(`✅ DOWNLOAD: Downloaded sample ${sampleUuid} (${arrayBuffer.byteLength} bytes)`)
            
            // Decode audio data
            const audioBuffer = await context.decodeAudioData(arrayBuffer)
            const audioData = AudioData.from(audioBuffer)
            
            // Generate peaks data (simplified)
            const peaks = new ArrayBuffer(audioBuffer.length * 4) // Simplified peaks
            
            // Create metadata
            const metadata: AudioMetaData = {
                name: `Sample ${sampleUuid}`,
                duration: audioBuffer.duration,
                bpm: 120,
                fileSize: arrayBuffer.byteLength,
                channels: audioBuffer.numberOfChannels,
                sampleRate: audioBuffer.sampleRate
            }
            
            // Store in OPFS for future use
            await ensureRoomFolderExists(roomId)
            await storeInRoom(roomId, UUID.parse(sampleUuid), audioData, peaks, metadata)
            console.log(`✅ DOWNLOAD: Stored sample ${sampleUuid} in OPFS for future use`)
            
            // Return the loaded data
            const { Peaks } = await import('fusion')
            return [audioData, Peaks.from(new ByteArrayInput(peaks)), metadata]
            
        } catch (error) {
            console.error(`❌ DOWNLOAD: Failed to download sample ${sampleUuid}:`, error)
            return null
        }
    }

    export const removeFromRoom = async (roomId: string, uuid: UUID.Format): Promise<void> => {
        const roomFolder = getRoomFolder(roomId)
        const path = `${roomFolder}/${UUID.toString(uuid)}`
        return OpfsAgent.delete(`${path}`)
    }

    // Unified token getter function to avoid duplication
    const getAuthTokenForStorage = (): { token: string | null, source: string } => {
        const urlParams = new URLSearchParams(window.location.search)
        
        // Try URL parameter first (base64 encoded)
        const urlToken = urlParams.get('auth_token')
        if (urlToken) {
            try {
                const decoded = atob(urlToken)
                if (decoded) {
                    return { token: decoded, source: 'URL parameter' }
                }
            } catch (e) {
                console.warn('⚠️ STORAGE-AUTH: Invalid base64 auth_token in URL:', e.message)
            }
        }
        
        // Try sessionStorage
        const sessionToken = sessionStorage.getItem('synxsphere_token')
        if (sessionToken) {
            return { token: sessionToken, source: 'sessionStorage' }
        }
        
        // Try localStorage
        const localToken = localStorage.getItem('token')
        if (localToken) {
            return { token: localToken, source: 'localStorage' }
        }
        
        // Try parent window (for iframe scenarios)
        try {
            if (window.parent && window.parent !== window) {
                const parentToken = window.parent.localStorage.getItem('token')
                if (parentToken) {
                    return { token: parentToken, source: 'parent window' }
                }
            }
        } catch (e) {
            console.warn('⚠️ STORAGE-AUTH: Could not access parent window token:', e.message)
        }
        
        return { token: null, source: 'none' }
    }

    // Helper function to sync database samples to OPFS
    const syncDatabaseToOpfs = async (roomId: string): Promise<ReadonlyArray<AudioSample>> => {
        console.log(`🔄 SYNC: Checking database for room ${roomId} samples...`)
        
        try {
            // Get auth token using unified function
            const { token, source } = getAuthTokenForStorage()
            
            if (!token) {
                console.log(`🔄 SYNC: No auth token found (source: ${source}), skipping database sync`)
                console.log('📋 SYNC: Checked locations:')
                console.log('  - URL auth_token parameter:', !!new URLSearchParams(window.location.search).get('auth_token'))
                console.log('  - sessionStorage synxsphere_token:', !!sessionStorage.getItem('synxsphere_token'))
                console.log('  - localStorage token:', !!localStorage.getItem('token'))
                console.log('  - Parent window token:', 'checked')
                return []
            }
            
            console.log(`🔄 SYNC: Using token from ${source}`)
            
            // Check if token is valid by length/format
            if (token.length < 10) {
                console.warn('⚠️ SYNC: Token appears too short, might be invalid')
            }
            
            // Determine API base URL
            let apiBaseUrl = 'http://localhost:8000' // SynxSphere main app
            try {
                const testResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'HEAD'
                })
                if (!testResponse.ok) {
                    apiBaseUrl = 'https://localhost:8443' // Collaboration proxy fallback
                    const fallbackResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                        headers: { 'Authorization': `Bearer ${token}` },
                        method: 'HEAD'
                    })
                    if (!fallbackResponse.ok) {
                        apiBaseUrl = 'http://localhost:3003' // Direct collaboration service
                    }
                }
            } catch {
                apiBaseUrl = 'http://localhost:3003' // Direct collaboration service fallback
            }
            
            console.log(`🔄 SYNC: Using API base URL: ${apiBaseUrl}`)
            
            // Fetch studio project data from database
            const response = await fetch(`${apiBaseUrl}/api/rooms/${roomId}/studio-project`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            
            if (!response.ok) {
                console.log(`🔄 SYNC: Database API returned ${response.status}, no sync needed`)
                return []
            }
            
            const projectData = await response.json()
            const dbAudioFiles = projectData.audioFiles || []
            
            if (dbAudioFiles.length === 0) {
                console.log(`🔄 SYNC: No audio files in database for room ${roomId}`)
                return []
            }
            
            console.log(`🔄 SYNC: Found ${dbAudioFiles.length} audio files in database`)
            
            // Convert database files to AudioSample format and try to sync missing ones
            const samples: AudioSample[] = []
            
            for (const dbFile of dbAudioFiles) {
                const sample: AudioSample = {
                    uuid: dbFile.id,
                    name: dbFile.originalName || dbFile.filename,
                    duration: dbFile.duration || 0,
                    bpm: 120, // Default BPM
                    fileSize: dbFile.fileSize || 0,
                    channels: dbFile.channels || 2,
                    sampleRate: dbFile.sampleRate || 44100
                }
                
                // Check if this sample exists in OPFS
                const roomFolder = getRoomFolder(roomId)
                const samplePath = `${roomFolder}/${sample.uuid}`
                
                try {
                    await OpfsAgent.read(`${samplePath}/meta.json`)
                    console.log(`✅ SYNC: Sample ${sample.name} already exists in OPFS`)
                } catch {
                    console.log(`🔄 SYNC: Sample ${sample.name} missing from OPFS, will need import`)
                    // Note: Actual audio data import will be handled by the calling code when needed
                }
                
                samples.push(sample)
            }
            
            return samples
            
        } catch (error) {
            console.error(`❌ SYNC: Failed to sync database to OPFS for room ${roomId}:`, error)
            return []
        }
    }

    export const listRoom = async (roomId: string): Promise<ReadonlyArray<AudioSample>> => {
        const roomFolder = getRoomFolder(roomId)
        console.log(`📋 OPFS: Attempting to list room folder: ${roomFolder}`)
        
        // First try to sync from database (for collaborative mode)
        const dbSamples = await syncDatabaseToOpfs(roomId)
        if (dbSamples.length > 0) {
            console.log(`✅ OPFS: Found ${dbSamples.length} samples from database sync`)
            return dbSamples
        }
        
        // Fallback to OPFS-only listing
        try {
            const files = await OpfsAgent.list(roomFolder)
            console.log(`📋 OPFS: Found ${files.length} items in room folder`)
            console.log(`📋 OPFS: Items:`, files.map(f => ({ name: f.name, kind: f.kind })))
            
            const directories = files.filter(file => file.kind === "directory")
            console.log(`📋 OPFS: Found ${directories.length} directories (samples)`)
            
            if (directories.length === 0) {
                console.log(`📋 OPFS: No sample directories found in room ${roomId}`)
                return []
            }
            
            const samples = await Promise.all(directories.map(async ({name}) => {
                try {
                    console.log(`📋 OPFS: Reading metadata for sample: ${name}`)
                    const array = await OpfsAgent.read(`${roomFolder}/${name}/meta.json`)
                    const metadata = JSON.parse(new TextDecoder().decode(array)) as AudioMetaData
                    console.log(`📋 OPFS: Successfully read metadata for sample: ${name}`)
                    return ({uuid: name, ...metadata})
                } catch (metaError) {
                    console.error(`❌ OPFS: Failed to read metadata for sample ${name}:`, metaError)
                    throw metaError
                }
            }))
            
            console.log(`✅ OPFS: Successfully loaded ${samples.length} samples from room ${roomId}`)
            return samples
            
        } catch (error) {
            console.error(`❌ OPFS: Failed to list room ${roomId} folder:`, error)
            console.error(`❌ OPFS: Error details:`, {
                name: error.name,
                message: error.message,
                stack: error.stack,
                roomFolder: roomFolder
            })
            
            // If it's a "not found" error, return empty array
            if (error.message && error.message.includes('not found')) {
                console.log(`🔍 Room ${roomId} OPFS folder does not exist yet, returning empty array`)
                return []
            }
            
            // For other errors, re-throw to trigger fallback logic
            throw error
        }
    }

    export const updateMetaInRoom = async (roomId: string, uuid: UUID.Format, meta: AudioMetaData): Promise<void> => {
        const roomFolder = getRoomFolder(roomId)
        const path = `${roomFolder}/${UUID.toString(uuid)}`
        return OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }
}