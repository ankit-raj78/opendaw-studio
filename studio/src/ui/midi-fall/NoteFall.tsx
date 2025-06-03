import css from "./NoteFall.sass?inline"
import {Html} from "dom"
import {Arrays, isInstanceOf, Lifecycle, ObservableValue} from "std"
import {createElement} from "jsx"
import {CanvasPainter} from "@/ui/canvas/painter.ts"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {LoopableRegion, MidiKeys, PPQN, ppqn} from "dsp"
import {StudioService} from "@/service/StudioService.ts"
import {NoteRegionBoxAdapter} from "@/audio-engine-shared/adapters/timeline/region/NoteRegionBoxAdapter.ts"
import {Fragmentor} from "@/worklet/Fragmentor.ts"
import {Fonts} from "@/ui/Fonts.ts"
import {Colors} from "@/ui/Colors.ts"

const className = Html.adoptStyleSheet(css, "NoteFall")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    pianoLayoutOwner: ObservableValue<PianoRollLayout>
    timeScaleOwner: ObservableValue<number>
    noteScaleOwner: ObservableValue<number>
    noteLabelsOwner: ObservableValue<boolean>
}

export const NoteFall = (
    {lifecycle, service, pianoLayoutOwner, timeScaleOwner, noteScaleOwner, noteLabelsOwner}: Construct) => {
    const enginePosition = service.engine.position()
    const canvas: HTMLCanvasElement = <canvas/>
    const painter = new CanvasPainter(canvas, painter => {
        const {context, actualWidth, actualHeight} = painter
        const visibleQuarter = PPQN.Quarter * timeScaleOwner.getValue()
        const labelEnabled = noteLabelsOwner.getValue()
        const min = enginePosition.getValue()
        const max = min + visibleQuarter
        const positionToY = (position: ppqn) => (1.0 - (position - min) / visibleQuarter) * actualHeight
        context.clearRect(0, 0, actualWidth, actualHeight)
        context.strokeStyle = "rgba(255, 255, 255, 0.2)"
        context.setLineDash([4, 4])
        context.beginPath()
        const layout = pianoLayoutOwner.getValue()
        for (const position of layout.octaveSplits) {
            const x = Math.floor(position * actualWidth)
            context.moveTo(x, 0.0)
            context.lineTo(x, actualHeight)
        }
        // TODO get project time signature, default to 4/4
        for (const position of Fragmentor.iterate(min, max, PPQN.fromSignature(3, 4))) {
            const y = Math.floor(positionToY(position))
            context.moveTo(0.0, y)
            context.lineTo(actualWidth, y)
        }
        context.stroke()
        if (!service.hasProjectSession) {return}
        context.setLineDash(Arrays.empty())
        context.textAlign = "center"
        context.textBaseline = "bottom"
        const {project} = service
        const noteWidth = actualWidth / layout.count * (noteScaleOwner.getValue() / 100.0)
        context.font = `${noteWidth * devicePixelRatio * 0.55}px ${Fonts.Rubik["font-family"]}`
        project.rootBoxAdapter.audioUnits.adapters().forEach(adapter => {
            const trackBoxAdapters = adapter.tracks.values()
            trackBoxAdapters.forEach((trackAdapter, index) => {
                const hue = index / trackBoxAdapters.length * 360
                for (const region of trackAdapter.regions.collection.iterateRange(min, max)) {
                    if (!isInstanceOf(region, NoteRegionBoxAdapter)) {continue}
                    const collection = region.optCollection.unwrap()
                    const events = collection.events
                    for (const {resultStart, resultEnd, rawStart} of LoopableRegion.locateLoops(region, min, max)) {
                        const searchStart = Math.floor(resultStart - rawStart)
                        const searchEnd = Math.floor(resultEnd - rawStart)
                        for (const note of events.iterateRange(searchStart - collection.maxDuration, searchEnd)) {
                            const x = layout.getCenteredX(note.pitch) * actualWidth
                            // inverses the y-axis
                            const y0 = positionToY(note.complete + rawStart)
                            const y1 = positionToY(note.position + rawStart)
                            const isPlaying = y1 >= actualHeight
                            const fillStyle = layout.getFillStyle(hue, isPlaying)
                            context.lineWidth = 1.5 * devicePixelRatio
                            context.fillStyle = fillStyle
                            context.strokeStyle = Colors.black
                            context.save()
                            context.beginPath()
                            context.roundRect(x - noteWidth / 2, y0, noteWidth, y1 - y0, 3 * devicePixelRatio)
                            context.fill()
                            context.stroke()
                            context.clip()
                            if (labelEnabled) {
                                context.fillStyle = Colors.black
                                MidiKeys.Names[note.pitch % 12]
                                    .split("")
                                    .forEach((letter, index) => context
                                        .fillText(letter, x, y1 - index * noteWidth * 0.4 * devicePixelRatio))
                            }
                            context.restore()
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
        service.sessionService.subscribe(painter.requestUpdate),
        pianoLayoutOwner.subscribe(painter.requestUpdate),
        timeScaleOwner.subscribe(painter.requestUpdate),
        noteScaleOwner.subscribe(painter.requestUpdate),
        noteLabelsOwner.subscribe(painter.requestUpdate)
    )
    return element
}