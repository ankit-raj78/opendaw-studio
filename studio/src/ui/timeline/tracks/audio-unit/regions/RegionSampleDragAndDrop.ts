import {AudioRegionBox} from "@/data/boxes"
import {ColorCodes} from "@/ui/mixer/ColorCodes.ts"
import {RegionCaptureTarget} from "@/ui/timeline/tracks/audio-unit/regions/RegionCapturing.ts"
import {ElementCapturing} from "@/ui/canvas/capturing.ts"
import {PPQN} from "dsp"
import {UUID} from "std"
import {RegionClipResolver} from "@/ui/timeline/tracks/audio-unit/regions/RegionClipResolver.ts"
import {CreateParameters, TimelineDragAndDrop} from "@/ui/timeline/tracks/audio-unit/TimelineDragAndDrop"
import {Project} from "@/project/Project"
import {Snapping} from "@/ui/timeline/Snapping"

export class RegionSampleDragAndDrop extends TimelineDragAndDrop<RegionCaptureTarget> {
    readonly #snapping: Snapping

    constructor(project: Project, capturing: ElementCapturing<RegionCaptureTarget>, snapping: Snapping) {
        super(project, capturing)

        this.#snapping = snapping
    }

    handleSample({
                     event,
                     trackBoxAdapter,
                     audioFileBox,
                     sample: {name, duration: durationInSeconds, bpm}
                 }: CreateParameters): void {
        const position = Math.max(this.#snapping.xToUnitFloor(event.clientX - this.capturing.element.getBoundingClientRect().left), 0)
        const duration = Math.round(PPQN.secondsToPulses(durationInSeconds, bpm))
        const solver = RegionClipResolver.fromRange(trackBoxAdapter, position, position + duration)
        solver()
        const regionId = UUID.generate()
        
        AudioRegionBox.create(this.project.boxGraph, regionId, box => {
            box.position.setValue(position)
            box.duration.setValue(duration)
            box.loopDuration.setValue(duration)
            box.regions.refer(trackBoxAdapter.box.regions)
            box.hue.setValue(ColorCodes.forTrackType(trackBoxAdapter.type))
            box.label.setValue(name)
            box.file.refer(audioFileBox)
        })
        
        // 🚀 Broadcast region creation to collaborators
        try {
            const ws: any = (window as any).wsClient
            if (ws?.isConnected && typeof ws.sendRegionCreated === 'function') {
                // Debug: Check audioFileBox
                console.log('[RegionSampleDragAndDrop] DEBUG - audioFileBox:', audioFileBox)
                console.log('[RegionSampleDragAndDrop] DEBUG - audioFileBox.address.uuid:', audioFileBox?.address?.uuid)
                
                // Ensure all UUIDs are valid before converting
                const regionIdStr = regionId ? UUID.toString(regionId) : 'unknown'
                const trackIdStr = trackBoxAdapter?.address?.uuid ? UUID.toString(trackBoxAdapter.address.uuid) : 'unknown'
                const sampleIdStr = audioFileBox?.address?.uuid ? UUID.toString(audioFileBox.address.uuid) : 'unknown'
                
                console.log('[RegionSampleDragAndDrop] Broadcasting region creation:', {
                    regionId: regionIdStr,
                    trackId: trackIdStr,
                    startTime: position,
                    duration,
                    sampleId: sampleIdStr
                })
                
                ws.sendRegionCreated(
                    regionIdStr,
                    trackIdStr,
                    position,
                    duration,
                    sampleIdStr
                )
            }
        } catch (err) {
            console.error('[RegionSampleDragAndDrop] ❌ Failed to broadcast region creation:', err)
        }
    }
}