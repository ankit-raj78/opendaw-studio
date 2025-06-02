import css from "./NoteFall.sass?inline"
import {Html} from "dom"
import {isInstanceOf, Lifecycle} from "std"
import {createElement} from "jsx"
import {CanvasPainter} from "@/ui/canvas/painter.ts"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {LoopableRegion, PPQN, ppqn} from "dsp"
import {StudioService} from "@/service/StudioService.ts"
import {NoteRegionBoxAdapter} from "@/audio-engine-shared/adapters/timeline/region/NoteRegionBoxAdapter.ts"

const className = Html.adoptStyleSheet(css, "NoteFall")

type Construct = {
    lifecycle: Lifecycle
    layout: PianoRollLayout
    service: StudioService
}

export const NoteFall = ({lifecycle, layout, service}: Construct) => {
    const VISIBLE_PPQN = PPQN.Bar * 2
    const enginePosition = service.engine.position()
    const canvas: HTMLCanvasElement = <canvas/>
    const painter = new CanvasPainter(canvas, painter => {
        const {context, actualWidth, actualHeight} = painter
        context.clearRect(0, 0, actualWidth, actualHeight)
        if (!service.hasProjectSession) {return}
        const {project} = service
        const min = enginePosition.getValue()
        const max = min + VISIBLE_PPQN
        const positionToY = (position: ppqn) => (1.0 - (position - enginePosition.getValue()) / VISIBLE_PPQN) * actualHeight
        const noteWidth = actualWidth / layout.count * 0.9
        project.rootBoxAdapter.audioUnits.adapters().forEach(adapter => {
            const trackBoxAdapters = adapter.tracks.values()
            trackBoxAdapters.slice(0, 2).forEach((trackAdapter, index) => {
                for (const region of trackAdapter.regions.collection.iterateRange(min, max)) {
                    if (!isInstanceOf(region, NoteRegionBoxAdapter)) {continue}
                    const collection = region.optCollection.unwrap()
                    const events = collection.events
                    for (const {resultStart, resultEnd, rawStart} of LoopableRegion.locateLoops(region, min, max)) {
                        const searchStart = Math.floor(resultStart - rawStart)
                        const searchEnd = Math.floor(resultEnd - rawStart)
                        for (const note of events.iterateRange(searchStart - collection.maxDuration, searchEnd)) {
                            const x = layout.getEqualizedX(note.pitch) * actualWidth
                            // inverses the y-axis
                            const y0 = positionToY(note.complete + rawStart)
                            const y1 = positionToY(note.position + rawStart)
                            const isPlaying = y1 >= actualHeight
                            context.fillStyle = `hsl(${index / trackBoxAdapters.length * 360}, ${isPlaying ? 50 : 20}%, ${isPlaying ? 70 : 50}%)`
                            context.beginPath()
                            context.roundRect(x - noteWidth / 2, y0, noteWidth, y1 - y0, 3)
                            context.fill()
                        }
                    }
                }
            })
        })
    })
    const element: HTMLElement = (<div className={className}>{canvas}</div>)
    lifecycle.ownAll(
        painter,
        enginePosition.subscribe(painter.requestUpdate),
        Html.watchResize(element, painter.requestUpdate),
        service.sessionService.subscribe(painter.requestUpdate)
    )
    return element
}