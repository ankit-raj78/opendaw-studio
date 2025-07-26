import {AudioClipBox} from "@/data/boxes"
import {ColorCodes} from "@/ui/mixer/ColorCodes.ts"
import {ElementCapturing} from "@/ui/canvas/capturing.ts"
import {PPQN} from "dsp"
import {UUID} from "std"
import {CreateParameters, TimelineDragAndDrop} from "@/ui/timeline/tracks/audio-unit/TimelineDragAndDrop"
import {Project} from "@/project/Project"
import {ClipCaptureTarget} from "./ClipCapturing"
import {ClipWidth} from "@/ui/timeline/tracks/audio-unit/clips/constants"

export class ClipSampleDragAndDrop extends TimelineDragAndDrop<ClipCaptureTarget> {
    constructor(project: Project, capturing: ElementCapturing<ClipCaptureTarget>) {
        super(project, capturing)
    }

    handleSample({
                     event, trackBoxAdapter, audioFileBox, sample: {name, duration: durationInSeconds, bpm}
                 }: CreateParameters): void {
        const x = event.clientX - this.capturing.element.getBoundingClientRect().left
        const index = Math.floor(x / ClipWidth)
        const duration = Math.round(PPQN.secondsToPulses(durationInSeconds, bpm))
        const clipId = UUID.generate()
        
        AudioClipBox.create(this.project.boxGraph, clipId, box => {
            box.index.setValue(index)
            box.duration.setValue(duration)
            box.clips.refer(trackBoxAdapter.box.clips)
            box.hue.setValue(ColorCodes.forTrackType(trackBoxAdapter.type))
            box.label.setValue(name)
            box.file.refer(audioFileBox)
        })
        
        // 🚀 Broadcast clip creation to collaborators
        try {
            const ws: any = (window as any).wsClient
            if (ws?.isConnected && typeof ws.sendClipCreated === 'function') {
                // Ensure all UUIDs are valid before converting
                const clipIdStr = clipId ? UUID.toString(clipId) : 'unknown'
                const trackIdStr = trackBoxAdapter?.uuid ? UUID.toString(trackBoxAdapter.uuid) : 'unknown'
                const sampleIdStr = audioFileBox?.uuid ? UUID.toString(audioFileBox.uuid) : 'unknown'
                
                console.log('[ClipSampleDragAndDrop] Broadcasting clip creation:', {
                    clipId: clipIdStr,
                    trackId: trackIdStr,
                    startTime: index,
                    duration,
                    sampleId: sampleIdStr
                })
                
                ws.sendClipCreated(
                    clipIdStr,
                    trackIdStr,
                    index,
                    duration,
                    sampleIdStr
                )
            }
        } catch (err) {
            console.error('[ClipSampleDragAndDrop] ❌ Failed to broadcast clip creation:', err)
        }
    }
}