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
        console.log(`💾 STORE: Starting storage for ${UUID.toString(uuid)}`)
        
        try {
            const path = `${Folder}/${UUID.toString(uuid)}`
            console.log(`💾 STORE: Writing files to path: ${path}`)
            console.log(`💾 STORE: Audio data size: ${audio.numberOfFrames} frames, ${audio.numberOfChannels} channels`)
            console.log(`💾 STORE: Peaks size: ${peaks.byteLength} bytes`)
            console.log(`💾 STORE: Metadata: ${JSON.stringify(meta)}`)
            
            // JSON validation
            let metaJsonString: string
            try {
                metaJsonString = JSON.stringify(meta)
                JSON.parse(metaJsonString)  // Verify integrity
            } catch (jsonError) {
                throw new Error(`Invalid metadata JSON: ${(jsonError as Error).message}`)
            }
            
            const metaBytes = new TextEncoder().encode(metaJsonString)
            
            // Null byte check
            if (metaBytes.includes(0)) {
                throw new Error(`Encoded metadata contains null bytes`)
            }
            
            // Write files individually with error handling
            try {
                const audioWavData = new Uint8Array(encodeWavFloat({
                    channels: audio.frames.slice(),
                    numFrames: audio.numberOfFrames,
                    sampleRate: audio.sampleRate
                }))
                console.log(`💾 STORE: Encoded WAV size: ${audioWavData.byteLength} bytes`)
                await OpfsAgent.write(`${path}/audio.wav`, audioWavData)
                console.log(`✅ STORE: audio.wav written successfully`)
            } catch (audioError) {
                console.error(`❌ STORE: Failed to write audio.wav:`, audioError)
                throw audioError
            }
            
            try {
                await OpfsAgent.write(`${path}/peaks.bin`, new Uint8Array(peaks))
                console.log(`✅ STORE: peaks.bin written successfully`)
            } catch (peaksError) {
                console.error(`❌ STORE: Failed to write peaks.bin:`, peaksError)
                throw peaksError
            }
            
            try {
                await OpfsAgent.write(`${path}/meta.json`, metaBytes)
                console.log(`✅ STORE: meta.json written successfully`)
            } catch (metaError) {
                console.error(`❌ STORE: Failed to write meta.json:`, metaError)
                throw metaError
            }
            
            console.log(`✅ STORE: All files stored successfully for ${UUID.toString(uuid)}`)
            
        } catch (error) {
            console.error(`❌ STORE: Storage failed for ${UUID.toString(uuid)}:`, error)
            console.error(`❌ STORE: Error details:`, {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack,
                uuid: UUID.toString(uuid),
                path: `${Folder}/${UUID.toString(uuid)}`
            })
            throw error
        }
    }

    export const updateMeta = async (uuid: UUID.Format, meta: AudioMetaData): Promise<void> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        return OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }

    export const load = async (uuid: UUID.Format, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData]> => {
        const path = `${Folder}/${UUID.toString(uuid)}`
        const uuidString = UUID.toString(uuid)
        
        try {
            // Try to load from global OPFS first
            const result = await Promise.all([
                OpfsAgent.read(`${path}/audio.wav`)
                    .then(bytes => context.decodeAudioData(bytes.buffer as ArrayBuffer)),
                OpfsAgent.read(`${path}/peaks.bin`)
                    .then(bytes => Peaks.from(new ByteArrayInput(bytes.buffer))),
                OpfsAgent.read(`${path}/meta.json`)
                    .then(bytes => JSON.parse(new TextDecoder().decode(bytes)))
            ])
            
            console.log(`✅ LOAD: Successfully loaded ${uuidString} from global OPFS`)
            return [AudioData.from(result[0]), result[1], result[2]]
            
        } catch (opfsError) {
            console.warn(`⚠️ LOAD: Sample ${uuidString} not found in global OPFS, attempting to download from database...`)
            
            // Try to download from database and store globally
            try {
                const downloadedSample = await downloadSampleFromDatabase(null, uuidString, context)
                if (downloadedSample) {
                    console.log(`✅ LOAD: Successfully downloaded and loaded ${uuidString} from database`)
                    
                    // Store in global OPFS for future use
                    const [audioData, peaks, metadata] = downloadedSample
                    await store(uuid, audioData, peaks.toArrayBuffer() as ArrayBuffer, metadata)
                    console.log(`✅ LOAD: Stored ${uuidString} in global OPFS for future use`)
                    
                    return downloadedSample
                }
            } catch (downloadError) {
                console.error(`❌ LOAD: Failed to download ${uuidString} from database:`, downloadError)
            }
            
            // If all else fails, throw the original OPFS error
            throw opfsError
        }
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

    // Folder existence cache to reduce redundant OPFS operations
    const folderExistenceCache = new Map<string, { exists: boolean, timestamp: number }>()
    const FOLDER_CACHE_DURATION = 2 * 60 * 1000 // 2 minutes

    // Ensure room folder exists by creating the directory structure step by step
    export const ensureRoomFolderExists = async (roomId: string): Promise<void> => {
        try {
            const roomFolder = getRoomFolder(roomId)
            
            // Check cache first
            const cached = folderExistenceCache.get(roomFolder)
            if (cached && (Date.now() - cached.timestamp) < FOLDER_CACHE_DURATION && cached.exists) {
                console.log(`✅ OPFS: Room ${roomId} folder exists (cached)`)
                return
            }
            
            console.log(`📁 OPFS: Checking room ${roomId} folder: ${roomFolder}`)
            
            // Try to list the room folder first
            console.log(`📁 OPFS: Attempting to list room folder...`)
            const files = await OpfsAgent.list(roomFolder)
            console.log(`✅ OPFS: Room ${roomId} folder already exists with ${files.length} items`)
            
            // Cache the successful result
            folderExistenceCache.set(roomFolder, { exists: true, timestamp: Date.now() })
        } catch (error) {
            console.log(`📁 OPFS: Room ${roomId} folder does not exist, creating...`)
            console.log(`📁 OPFS: List error was:`, {
                name: (error as Error).name,
                message: (error as Error).message
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
                        name: (baseError as Error).name,
                        message: (baseError as Error).message
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
                
                // Cache the successful creation
                folderExistenceCache.set(roomFolder, { exists: true, timestamp: Date.now() })
                
            } catch (createError) {
                const roomFolder = getRoomFolder(roomId)
                console.error(`❌ OPFS: Failed to create room ${roomId} folder:`, createError)
                console.error(`❌ OPFS: Create error details:`, {
                    name: (createError as Error).name,
                    message: (createError as Error).message,
                    stack: (createError as Error).stack,
                    roomId: roomId,
                    roomFolder: roomFolder
                })
                // Cache the failed result temporarily (shorter duration)
                folderExistenceCache.set(roomFolder, { exists: false, timestamp: Date.now() })
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
        console.log(`📁 STORE-ROOM: Starting storage for ${UUID.toString(uuid)} in room ${roomId}`)
        
        try {
            await ensureRoomFolderExists(roomId)
            const roomFolder = getRoomFolder(roomId)
            const path = `${roomFolder}/${UUID.toString(uuid)}`
            
            console.log(`📁 STORE-ROOM: Writing files to path: ${path}`)
            console.log(`📁 STORE-ROOM: Audio data size: ${audio.numberOfFrames} frames, ${audio.numberOfChannels} channels`)
            console.log(`📁 STORE-ROOM: Peaks size: ${peaks.byteLength} bytes`)
            console.log(`📁 STORE-ROOM: Metadata: ${JSON.stringify(meta)}`)
            
            // Write files individually with error handling
            try {
                const audioWavData = new Uint8Array(encodeWavFloat({
                    channels: audio.frames.slice(),
                    numFrames: audio.numberOfFrames,
                    sampleRate: audio.sampleRate
                }))
                console.log(`📁 STORE-ROOM: Encoded WAV size: ${audioWavData.byteLength} bytes`)
                await OpfsAgent.write(`${path}/audio.wav`, audioWavData)
                console.log(`✅ STORE-ROOM: audio.wav written successfully`)
            } catch (audioError) {
                console.error(`❌ STORE-ROOM: Failed to write audio.wav:`, audioError)
                throw audioError
            }
            
            try {
                await OpfsAgent.write(`${path}/peaks.bin`, new Uint8Array(peaks))
                console.log(`✅ STORE-ROOM: peaks.bin written successfully`)
            } catch (peaksError) {
                console.error(`❌ STORE-ROOM: Failed to write peaks.bin:`, peaksError)
                throw peaksError
            }
            
            try {
                await OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
                console.log(`✅ STORE-ROOM: meta.json written successfully`)
                
                // VERIFICATION: Immediately try to read back the meta.json to verify it was written
                try {
                    const verifyBytes = await OpfsAgent.read(`${path}/meta.json`)
                    const verifyData = JSON.parse(new TextDecoder().decode(verifyBytes))
                    console.log(`✅ STORE-ROOM: meta.json verification successful - can read back data:`, {
                        name: verifyData.name,
                        duration: verifyData.duration,
                        bytesWritten: verifyBytes.length
                    })
                } catch (verifyError) {
                    console.error(`❌ STORE-ROOM: meta.json verification FAILED - could not read back:`, verifyError)
                }
            } catch (metaError) {
                console.error(`❌ STORE-ROOM: Failed to write meta.json:`, metaError)
                throw metaError
            }
            
            console.log(`✅ STORE-ROOM: All files stored successfully for ${UUID.toString(uuid)} in room ${roomId}`)
            
        } catch (error) {
            console.error(`❌ STORE-ROOM: Storage failed for ${UUID.toString(uuid)} in room ${roomId}:`, error)
            console.error(`❌ STORE-ROOM: Error details:`, {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack,
                roomId: roomId,
                uuid: UUID.toString(uuid),
                roomFolder: getRoomFolder(roomId)
            })
            throw error
        }
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
    const downloadSampleFromDatabase = async (roomId: string | null, sampleUuid: string, context: AudioContext): Promise<[AudioData, Peaks, AudioMetaData] | null> => {
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
            
            // Determine API base URL - audio files are served from SynxSphere API
            let apiBaseUrl = 'https://app.synctown.ai:8443'
            try {
                const testResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'HEAD'
                })
                if (!testResponse.ok) {
                    console.warn('⚠️ SynxSphere API not available, using HTTPS proxy')
                }
            } catch {
                console.warn('⚠️ SynxSphere API health check failed, using HTTPS proxy')
            }
            
            console.log(`📡 DOWNLOAD: Fetching sample ${sampleUuid} from ${apiBaseUrl}`)
            console.log(`📡 DOWNLOAD: Full URL: ${apiBaseUrl}/api/audio/stream/${sampleUuid}`)
            console.log(`📡 DOWNLOAD: Using token: ${token.substring(0, 20)}...`)
            
            // Download the audio file
            const response = await fetch(`${apiBaseUrl}/api/audio/stream/${sampleUuid}`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })
            
            console.log(`📡 DOWNLOAD: Response status: ${response.status} ${response.statusText}`)
            console.log(`📡 DOWNLOAD: Response headers:`, Object.fromEntries(response.headers.entries()))
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`⚠️ DOWNLOAD: Sample ${sampleUuid} not found on SynxSphere server (404)`)
                    console.log(`� DOWNLOAD: Trying external OpenDAW API fallback for ${sampleUuid}`)
                    
                    try {
                        const externalResponse = await fetch(`https://assets.opendaw.studio/samples/${sampleUuid}`)
                        console.log(`📡 EXTERNAL: Response status: ${externalResponse.status} ${externalResponse.statusText}`)
                        
                        if (externalResponse.ok) {
                            const externalArrayBuffer = await externalResponse.arrayBuffer()
                            console.log(`✅ EXTERNAL: Downloaded sample ${sampleUuid} from OpenDAW API (${externalArrayBuffer.byteLength} bytes)`)
                            
                            // Decode audio data from external API
                            const audioBuffer = await context.decodeAudioData(externalArrayBuffer)
                            const audioData = AudioData.from(audioBuffer)
                            
                            // Generate proper peaks data using AudioPeaks
                            console.log(`🔄 EXTERNAL: Generating peaks for external sample ${sampleUuid}...`)
                            const { AudioPeaks } = await import('@/audio/AudioPeaks')
                            const externalPeaksBuffer = await AudioPeaks.generate(audioData, () => {})
                            console.log(`✅ EXTERNAL: Generated peaks for external sample`)
                            
                            // Create metadata
                            const metadata: AudioMetaData = {
                                name: `External Sample ${sampleUuid}`,
                                duration: audioBuffer.duration,
                                bpm: 120,
                                sample_rate: audioBuffer.sampleRate
                            }
                            
                            // Convert peaks buffer to Peaks object
                            const { Peaks } = await import('fusion')
                            return [audioData, Peaks.from(new ByteArrayInput(externalPeaksBuffer)), metadata]
                        } else {
                            console.warn(`⚠️ EXTERNAL: Sample ${sampleUuid} not found on OpenDAW API either (${externalResponse.status})`)
                        }
                    } catch (externalError) {
                        console.error(`❌ EXTERNAL: Failed to download ${sampleUuid} from OpenDAW API:`, externalError)
                    }
                    
                    console.warn(`💡 DOWNLOAD: Sample ${sampleUuid} not available from any source`)
                    return null // Return null instead of throwing to handle missing files gracefully
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
                }
            }
            
            const arrayBuffer = await response.arrayBuffer()
            console.log(`✅ DOWNLOAD: Downloaded sample ${sampleUuid} (${arrayBuffer.byteLength} bytes)`)
            
            if (arrayBuffer.byteLength === 0) {
                throw new Error(`Downloaded sample ${sampleUuid} has 0 bytes - API may not be working correctly`)
            }
            
            // Decode audio data
            const audioBuffer = await context.decodeAudioData(arrayBuffer)
            const audioData = AudioData.from(audioBuffer)
            
            // Generate proper peaks data using AudioPeaks
            console.log(`🔄 DOWNLOAD: Generating peaks for sample ${sampleUuid}...`)
            const { AudioPeaks } = await import('@/audio/AudioPeaks')
            const peaks = await AudioPeaks.generate(audioData, () => {})
            console.log(`✅ DOWNLOAD: Generated peaks (${peaks.byteLength} bytes)`)
            
            // Create metadata
            const metadata: AudioMetaData = {
                name: `Sample ${sampleUuid}`,
                duration: audioBuffer.duration,
                bpm: 120,
                sample_rate: audioBuffer.sampleRate
            }
            
            // Store in OPFS for future use
            console.log(`📁 DOWNLOAD: About to store sample ${sampleUuid} in OPFS...`)
            try {
                if (roomId) {
                    // Store in room-specific OPFS
                    await ensureRoomFolderExists(roomId)
                    console.log(`📁 DOWNLOAD: Room folder ensured for room ${roomId}`)
                    
                    await storeInRoom(roomId, UUID.parse(sampleUuid), audioData, peaks, metadata)
                    console.log(`✅ DOWNLOAD: Successfully stored sample ${sampleUuid} in room OPFS for future use`)
                } else {
                    // Store in global OPFS
                    await store(UUID.parse(sampleUuid), audioData, peaks, metadata)
                    console.log(`✅ DOWNLOAD: Successfully stored sample ${sampleUuid} in global OPFS for future use`)
                }
            } catch (storageError) {
                console.error(`❌ DOWNLOAD: Failed to store sample ${sampleUuid} in OPFS:`, storageError)
                console.error(`❌ DOWNLOAD: Storage error details:`, {
                    name: (storageError as Error).name,
                    message: (storageError as Error).message,
                    stack: (storageError as Error).stack,
                    roomId: roomId,
                    sampleUuid: sampleUuid
                })
                // Don't return null here - we can still return the audio data even if storage failed
                // The user can use the audio now, but it won't be cached for later
                console.warn(`⚠️ DOWNLOAD: Continuing with audio data despite storage failure`)
            }
            
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

    // Token caching to reduce redundant authentication
    let cachedToken: { token: string | null, source: string, timestamp: number } | null = null
    const TOKEN_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

    // Unified token getter function to avoid duplication
    const getAuthTokenForStorage = (): { token: string | null, source: string } => {
        // Check cache first
        if (cachedToken && (Date.now() - cachedToken.timestamp) < TOKEN_CACHE_DURATION) {
            console.log('✅ TOKEN-DEBUG: Using cached token from', cachedToken.source)
            return { token: cachedToken.token, source: cachedToken.source }
        }

        const urlParams = new URLSearchParams(window.location.search)
        
        console.log('🔍 TOKEN-DEBUG: Checking all token sources...')
        console.log('🔍 TOKEN-DEBUG: Current URL:', window.location.href)
        console.log('🔍 TOKEN-DEBUG: URL params:', Object.fromEntries(urlParams.entries()))
        
        let result: { token: string | null, source: string }

        // Try URL parameter first (base64 encoded)
        const urlToken = urlParams.get('auth_token')
        console.log('🔍 TOKEN-DEBUG: URL auth_token:', urlToken ? `${urlToken.substring(0, 20)}...` : 'null')
        if (urlToken) {
            try {
                const decoded = atob(urlToken)
                if (decoded) {
                    console.log('✅ TOKEN-DEBUG: Using decoded URL token')
                    result = { token: decoded, source: 'URL parameter' }
                    // Cache the token
                    cachedToken = { ...result, timestamp: Date.now() }
                    return result
                }
            } catch (e) {
                console.warn('⚠️ STORAGE-AUTH: Invalid base64 auth_token in URL:', (e as Error).message)
            }
        }
        
        // Try sessionStorage
        const sessionToken = sessionStorage.getItem('synxsphere_token')
        console.log('🔍 TOKEN-DEBUG: sessionStorage synxsphere_token:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'null')
        if (sessionToken) {
            console.log('✅ TOKEN-DEBUG: Using sessionStorage token')
            result = { token: sessionToken, source: 'sessionStorage' }
            cachedToken = { ...result, timestamp: Date.now() }
            return result
        }
        
        // Try localStorage
        const localToken = localStorage.getItem('token')
        console.log('🔍 TOKEN-DEBUG: localStorage token:', localToken ? `${localToken.substring(0, 20)}...` : 'null')
        if (localToken) {
            console.log('✅ TOKEN-DEBUG: Using localStorage token')
            result = { token: localToken, source: 'localStorage' }
            cachedToken = { ...result, timestamp: Date.now() }
            return result
        }
        
        // Try parent window (for iframe scenarios)
        try {
            if (window.parent && window.parent !== window) {
                const parentToken = window.parent.localStorage.getItem('token')
                console.log('🔍 TOKEN-DEBUG: parent window token:', parentToken ? `${parentToken.substring(0, 20)}...` : 'null')
                if (parentToken) {
                    console.log('✅ TOKEN-DEBUG: Using parent window token')
                    result = { token: parentToken, source: 'parent window' }
                    cachedToken = { ...result, timestamp: Date.now() }
                    return result
                }
            }
        } catch (e) {
            console.warn('⚠️ STORAGE-AUTH: Could not access parent window token:', (e as Error).message)
        }
        
        console.log('❌ TOKEN-DEBUG: No token found in any location')
        result = { token: null, source: 'none' }
        cachedToken = { ...result, timestamp: Date.now() }
        return result
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
            
            // Determine API base URL - studio-project API is served from SynxSphere API
            let apiBaseUrl = 'https://app.synctown.ai:8443'
            try {
                const testResponse = await fetch(`${apiBaseUrl}/api/health`, { 
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'HEAD'
                })
                if (!testResponse.ok) {
                    console.warn('⚠️ SynxSphere API not available, using HTTPS proxy')
                }
            } catch {
                console.warn('⚠️ SynxSphere API health check failed, using HTTPS proxy')
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
            
            // Convert database files to AudioSample format and download missing ones
            const samples: AudioSample[] = []
            
            for (const dbFile of dbAudioFiles) {
                const sample: AudioSample = {
                    uuid: dbFile.id,
                    name: dbFile.originalName || dbFile.filename,
                    duration: dbFile.duration || 0,
                    bpm: 120, // Default BPM
                    sample_rate: dbFile.sampleRate || 44100
                }
                
                // Check if this sample exists in OPFS
                const roomFolder = getRoomFolder(roomId)
                const samplePath = `${roomFolder}/${sample.uuid}`
                
                try {
                    await OpfsAgent.read(`${samplePath}/meta.json`)
                    console.log(`✅ SYNC: Sample ${sample.name} already exists in OPFS`)
                } catch {
                    console.log(`🔄 SYNC: Sample ${sample.name} missing from OPFS, downloading now...`)
                    
                    try {
                        // Create AudioContext for decoding
                        const audioContext = new AudioContext()
                        
                        // Download and store the sample immediately
                        const downloadedSample = await downloadSampleFromDatabase(roomId, sample.uuid, audioContext)
                        
                        if (downloadedSample) {
                            console.log(`✅ SYNC: Successfully downloaded and stored ${sample.name}`)
                        } else {
                            console.warn(`⚠️ SYNC: Failed to download ${sample.name} (file may not exist on server), but keeping in list`)
                            // Still add the sample to the list even if download failed
                            // The UI can show it as unavailable but user can see it exists in database
                        }
                        
                        // Close the audio context to free resources
                        await audioContext.close()
                        
                    } catch (downloadError) {
                        console.error(`❌ SYNC: Failed to download sample ${sample.name}:`, downloadError)
                        // Continue with next sample - don't fail the entire sync
                        // Still add the sample to the list so user knows it exists in database
                        console.warn(`⚠️ SYNC: Keeping ${sample.name} in sample list despite download failure`)
                    }
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
        
        // First try to sync from database (for collaborative mode) but don't fail if it doesn't work
        try {
            const dbSamples = await syncDatabaseToOpfs(roomId)
            if (dbSamples.length > 0) {
                console.log(`✅ OPFS: Found ${dbSamples.length} samples from database sync`)
                return dbSamples
            }
        } catch (syncError) {
            console.warn(`⚠️ OPFS: Database sync failed for room ${roomId}, falling back to OPFS-only listing:`, syncError)
            // Continue with OPFS-only approach below
        }
        
        // Check if room folder exists and try to copy global samples if it's empty
        try {
            const files = await OpfsAgent.list(roomFolder)
            console.log(`📋 OPFS: Found ${files.length} items in room folder`)
            
            if (files.length === 0) {
                // Room folder is empty, try to copy from global samples
                console.log(`📋 OPFS: Room folder empty, checking for global samples to copy...`)
                try {
                    const globalSamples = await AudioStorage.list()
                    console.log(`📋 OPFS: Found ${globalSamples.length} global samples`)
                    
                    if (globalSamples.length > 0) {
                        console.log(`📋 OPFS: Copying ${globalSamples.length} global samples to room folder...`)
                        await ensureRoomFolderExists(roomId)
                        
                        for (const sample of globalSamples) {
                            try {
                                const globalPath = `${Folder}/${sample.uuid}`
                                const roomPath = `${roomFolder}/${sample.uuid}`
                                
                                // Copy all files (audio.wav, peaks.bin, meta.json)
                                const [audioData, peaksData, metaData] = await Promise.all([
                                    OpfsAgent.read(`${globalPath}/audio.wav`),
                                    OpfsAgent.read(`${globalPath}/peaks.bin`),
                                    OpfsAgent.read(`${globalPath}/meta.json`)
                                ])
                                
                                await Promise.all([
                                    OpfsAgent.write(`${roomPath}/audio.wav`, audioData),
                                    OpfsAgent.write(`${roomPath}/peaks.bin`, peaksData),
                                    OpfsAgent.write(`${roomPath}/meta.json`, metaData)
                                ])
                                
                                console.log(`✅ OPFS: Copied sample ${sample.uuid} to room folder`)
                            } catch (copyError) {
                                console.warn(`⚠️ OPFS: Failed to copy sample ${sample.uuid}:`, copyError)
                            }
                        }
                        
                        // Re-list room folder after copying
                        const updatedFiles = await OpfsAgent.list(roomFolder)
                        console.log(`✅ OPFS: Room folder now has ${updatedFiles.length} items after copying`)
                    }
                } catch (globalError) {
                    console.warn(`⚠️ OPFS: Failed to copy global samples:`, globalError)
                }
            }
            
            // List room samples
            const roomFiles = await OpfsAgent.list(roomFolder)
            console.log(`📋 OPFS: Items:`, roomFiles.map(f => ({ name: f.name, kind: f.kind })))
            
            const directories = roomFiles.filter(file => file.kind === "directory")
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
            const err = error as Error
            console.error(`❌ OPFS: Failed to list room ${roomId} folder:`, err)
            console.error(`❌ OPFS: Error details:`, {
                name: err.name,
                message: err.message,
                stack: err.stack,
                roomFolder: roomFolder
            })
            
            // If it's a "not found" error, return empty array
            if (err.message && err.message.includes('not found')) {
                console.log(`🔍 Room ${roomId} OPFS folder does not exist yet, returning empty array`)
                return []
            }
            
            // For other errors, re-throw to trigger fallback logic
            throw err
        }
    }

    export const updateMetaInRoom = async (roomId: string, uuid: UUID.Format, meta: AudioMetaData): Promise<void> => {
        const roomFolder = getRoomFolder(roomId)
        const path = `${roomFolder}/${UUID.toString(uuid)}`
        return OpfsAgent.write(`${path}/meta.json`, new TextEncoder().encode(JSON.stringify(meta)))
    }
}