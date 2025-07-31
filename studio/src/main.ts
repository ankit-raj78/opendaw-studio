import "./main.sass"
import {App} from "@/ui/App.tsx"
import {Option, panic, Procedure, unitValue, UUID} from "std"
import {StudioService} from "@/service/StudioService"
import {UIAudioManager} from "@/project/UIAudioManager"
import {AudioData} from "@/audio/AudioData"
import {showCacheDialog, showErrorDialog, showInfoDialog} from "@/ui/components/dialogs.tsx"
import {installCursors} from "@/ui/Cursors.ts"
import {BuildInfo} from "./BuildInfo"
import {Surface} from "@/ui/surface/Surface.tsx"
import {replaceChildren} from "jsx"
import {ContextMenu} from "@/ui/ContextMenu.ts"
import {Spotlight} from "@/ui/spotlight/Spotlight.tsx"
import {SampleApi} from "@/service/SampleApi.ts"
import {testFeatures} from "@/features.ts"
import {MissingFeature} from "@/ui/MissingFeature.tsx"
import {UpdateMessage} from "@/ui/UpdateMessage.tsx"
import {AudioServerApi} from "@/audio/AudioServerApi"
import {AudioMetaData} from "@/audio/AudioMetaData"
import {AudioStorage} from "@/audio/AudioStorage"
import {showStoragePersistDialog} from "@/AppDialogs"
import {Promises} from "runtime"
import {AnimationFrame, Browser, Events, Keyboard} from "dom"
import {AudioOutputDevice} from "@/audio/AudioOutputDevice"
import {FontLoader} from "@/ui/FontLoader"
import {AudioWorklets} from "@/audio-engine/AudioWorklets"
import {ErrorHandler} from "@/errors/ErrorHandler"
import {initializeSynxSphereIntegration, startAutoSave} from "@/synxsphere-integration"

window.name = "main"

const loadBuildInfo = async () => fetch(`/build-info.json?v=${Date.now()}`).then(x => x.json().then(x => x as BuildInfo))

requestAnimationFrame(async () => {
        if (!window.crossOriginIsolated) {return panic("window must be crossOriginIsolated")}
        console.debug("booting...")
        await FontLoader.load()
        const testFeaturesResult = await Promises.tryCatch(testFeatures())
        if (testFeaturesResult.status === "rejected") {
            document.querySelector("#preloader")?.remove()
            replaceChildren(document.body, MissingFeature({error: testFeaturesResult.error}) as any)
            return
        }
        const buildInfo: BuildInfo = await loadBuildInfo()
        console.debug("buildInfo", buildInfo)
        console.debug("isLocalHost", Browser.isLocalHost())
        console.debug("agent", Browser.userAgent)
        const sampleRate = Browser.isFirefox() ? undefined : 48000
        console.debug("requesting custom sampleRate", sampleRate ?? "'No (Firefox)'")
        const context = new AudioContext({sampleRate, latencyHint: 0})
        console.debug(`AudioContext state: ${context.state}, sampleRate: ${context.sampleRate}`)
        const audioWorklets = await Promises.tryCatch(AudioWorklets.install(context))
        if (audioWorklets.status === "rejected") {
            showErrorDialog("Audio",
                "Boot Error", `Could not boot audio-worklets (${audioWorklets.error})`, Option.None)
            return
        }
        if (context.state === "suspended") {
            window.addEventListener("click",
                async () => {
                    if (context.state === "suspended") {
                        await context.resume().then(() =>
                            console.debug(`AudioContext resumed (${context.state})`))
                    }
                }, {capture: true})  // 移除 once: true，允许多次尝试恢复
        }
        const audioDevices = await AudioOutputDevice.create(context)
        const audioManager = new UIAudioManager({
            fetch: async (uuid: UUID.Format, progress: Procedure<unitValue>): Promise<[AudioData, AudioMetaData]> => {
                console.log(`🔄 MAIN: AudioManager.fetch called for sample ${UUID.toString(uuid)}`)
                console.log(`🔍 MAIN: Current URL: ${window.location.href}`)
                console.log(`🔍 MAIN: URL pathname: ${window.location.pathname}`)
                console.log(`🔍 MAIN: URL search: ${window.location.search}`)
                
                // Try to detect room context first
                let roomId = ''
                try {
                    const urlParams = new URLSearchParams(window.location.search)
                    
                    // First try 'roomId' parameter
                    let urlRoomId = urlParams.get('roomId')
                    console.log(`🔍 MAIN: URL roomId parameter: ${urlRoomId}`)
                    
                    if (urlRoomId) {
                        roomId = urlRoomId
                        console.log(`🔍 MAIN: Room ID from URL parameter: ${roomId}`)
                    } else {
                        // Try 'projectId' parameter (collaborative mode uses this format)
                        const projectId = urlParams.get('projectId')
                        console.log(`🔍 MAIN: URL projectId parameter: ${projectId}`)
                        
                        if (projectId && projectId.startsWith('room-')) {
                            // Extract room ID from 'room-{uuid}' format
                            roomId = projectId.replace('room-', '')
                            console.log(`🔍 MAIN: Room ID extracted from projectId: ${roomId}`)
                        } else if (projectId) {
                            // Use projectId directly if it doesn't have 'room-' prefix
                            roomId = projectId
                            console.log(`🔍 MAIN: Room ID from projectId directly: ${roomId}`)
                        } else {
                            // Try to extract from current URL path if it contains room info
                            const pathMatch = window.location.pathname.match(/\/room\/([^\/]+)/)
                            console.log(`🔍 MAIN: Path match result: ${pathMatch}`)
                            if (pathMatch) {
                                roomId = pathMatch[1]
                                console.log(`🔍 MAIN: Room ID from path: ${roomId}`)
                            }
                        }
                    }
                } catch (urlError) {
                    console.warn(`⚠️ MAIN: Failed to detect room context:`, urlError)
                }
                
                console.log(`🔍 MAIN: Final detected room ID: '${roomId}'`)
                
                if (roomId) {
                    console.log(`🔄 MAIN: Room context detected (${roomId}), using collaborative sample loading`)
                    // In collaborative mode, use AudioStorage which can download from our database
                    try {
                        console.log(`🔄 MAIN: Calling AudioStorage.load() for sample ${UUID.toString(uuid)}`)
                        const [audioData, peaks, metadata] = await AudioStorage.load(uuid, context)
                        console.log(`✅ MAIN: Successfully loaded sample ${UUID.toString(uuid)} from collaborative storage`)
                        // Progress is handled internally by AudioStorage
                        progress(1.0)
                        return [audioData, metadata]
                    } catch (error) {
                        console.error(`❌ MAIN: Failed to load sample ${UUID.toString(uuid)} from collaborative storage:`, error)
                        console.error(`❌ MAIN: Error details:`, {
                            name: (error as Error).name,
                            message: (error as Error).message,
                            stack: (error as Error).stack
                        })
                        // Fall back to external API as last resort
                        console.log(`🔄 MAIN: Falling back to external OpenDAW API for sample ${UUID.toString(uuid)}`)
                        return SampleApi.load(context, uuid, progress)
                    }
                } else {
                    console.log(`🔄 MAIN: No room context, using external OpenDAW API`)
                    // Non-collaborative mode, use external OpenDAW API
                    return SampleApi.load(context, uuid, progress)
                }
            }
        } satisfies AudioServerApi, context)
        const service: StudioService =
            new StudioService(context, audioWorklets.value, audioDevices, audioManager, buildInfo)
        const errorHandler = new ErrorHandler(service)
        const surface = Surface.main({
            config: (surface: Surface) => {
                surface.ownAll(
                    Events.subscribe(surface.owner, "keydown", event => {
                        if (event.defaultPrevented) {return}
                        if (Keyboard.isControlKey(event) && event.key.toLowerCase() === "z") {
                            if (event.shiftKey) {
                                service.runIfProject(project => project.editing.redo())
                            } else {
                                service.runIfProject(project => project.editing.undo())
                            }
                        }
                    }),
                    ContextMenu.install(surface.owner),
                    Spotlight.install(surface, service)
                )
            }
        }, errorHandler)
        document.querySelector("#preloader")?.remove()
        document.addEventListener("touchmove", (event: TouchEvent) => event.preventDefault(), {passive: false})
        replaceChildren(surface.ground, App(service) as any)
        AnimationFrame.start()
        installCursors()
        
        // Initialize SynxSphere integration
        initializeSynxSphereIntegration(service).then(() => {
            console.log('SynxSphere integration initialized')
            startAutoSave(service)
        })
        if (buildInfo.env === "production" && !Browser.isLocalHost()) {
            const uuid = buildInfo.uuid
            const sourceCss = document.querySelector<HTMLLinkElement>("link[rel='stylesheet']")?.href ?? ""
            const sourceCode = document.querySelector<HTMLScriptElement>("script[src]")?.src ?? ""
            if (!sourceCss.includes(uuid) || !sourceCode.includes(uuid)) {
                console.warn("Cache issue:")
                console.warn("expected uuid", uuid)
                console.warn("sourceCss", sourceCss)
                console.warn("sourceCode", sourceCode)
                showCacheDialog()
                return
            }
            const checkExtensions = setInterval(() => {
                if (document.scripts.length > 1) {
                    showInfoDialog({
                        headline: "Warning",
                        message: "Please disable extensions to avoid undefined behavior.",
                        okText: "Ignore"
                    }).then()
                    clearInterval(checkExtensions)
                }
            }, 5_000)
            const checkUpdates = setInterval(async () => {
                if (!navigator.onLine) {return}
                const {status, value: newBuildInfo} = await Promises.tryCatch(loadBuildInfo())
                if (status === "resolved" && newBuildInfo.uuid !== undefined && newBuildInfo.uuid !== buildInfo.uuid) {
                    document.body.prepend(UpdateMessage() as unknown as Node)
                    console.warn("A new version is online.")
                    clearInterval(checkUpdates)
                }
            }, 5_000)
        } else {
            console.debug("No production checks (build version & updates).")
        }
        if (Browser.isFirefox()) {
            const persisted = await Promises.tryCatch(navigator.storage.persisted())
            console.debug("Firefox.isPersisted", persisted.value)
            if (persisted.status === "resolved" && !persisted.value) {
                await Promises.tryCatch(showStoragePersistDialog())
            }
        }
        // delete obsolete indexedDB
        try {indexedDB.deleteDatabase("audio-file-cache")} catch (_: any) {}
        // delete obsolete samples
        AudioStorage.clean().then()
    }
)