import css from "./NoteFall.sass?inline"
import {Html} from "dom"
import {Arrays, isInstanceOf, Lifecycle} from "std"
import {createElement} from "jsx"
import {CanvasPainter} from "@/ui/canvas/painter.ts"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {LoopableRegion, MidiKeys, PPQN, ppqn} from "dsp"
import {NoteRegionBoxAdapter} from "@/audio-engine-shared/adapters/timeline/region/NoteRegionBoxAdapter.ts"
import {Fragmentor} from "@/worklet/Fragmentor.ts"
import {Fonts} from "@/ui/Fonts.ts"
import {Project} from "@/project/Project.ts"

const className = Html.adoptStyleSheet(css, "NoteFall")

type Construct = {
    lifecycle: Lifecycle
    project: Project
}

export const NoteFall = (
    {lifecycle, project}: Construct) => {
    const enginePosition = project.service.engine.position()
    const pianoMode = project.rootBoxAdapter.pianoMode
    const {keyboard, timeRangeInQuarters, noteScale, noteLabels, transpose} = pianoMode
    const canvas: HTMLCanvasElement = <canvas/>
    const painter = new CanvasPainter(canvas, painter => {
        const {context, actualWidth, actualHeight} = painter
        const timeRange = PPQN.Quarter * timeRangeInQuarters.getValue()
        const labelEnabled = noteLabels.getValue()
        const min = enginePosition.getValue()
        const max = min + timeRange
        const positionToY = (position: ppqn) => (1.0 - (position - min) / timeRange) * actualHeight
        context.clearRect(0, 0, actualWidth, actualHeight)
        context.strokeStyle = "rgba(255, 255, 255, 0.2)"
        context.setLineDash([4, 4])
        context.beginPath()
        const pianoLayout = PianoRollLayout.Defaults()[keyboard.getValue()]
        for (const position of pianoLayout.octaveSplits) {
            const x = Math.floor(position * actualWidth)
            context.moveTo(x, 0.0)
            context.lineTo(x, actualHeight)
        }
        const {nominator, denominator} = project.timelineBoxAdapter.box.signature
        const stepSize = PPQN.fromSignature(nominator.getValue(), denominator.getValue())
        for (const position of Fragmentor.iterate(min, max, stepSize)) {
            const y = Math.floor(positionToY(position))
            context.moveTo(0.0, y)
            context.lineTo(actualWidth, y)
        }
        context.stroke()
        context.setLineDash(Arrays.empty())
        context.textAlign = "center"
        context.textBaseline = "bottom"
        const noteWidth = actualWidth / pianoLayout.count * noteScale.getValue()
        context.font = `${noteWidth * devicePixelRatio * 0.55}px ${Fonts.Rubik["font-family"]}`
        project.rootBoxAdapter.audioUnits.adapters().forEach(audioUnitAdapter => {
            const trackBoxAdapters = audioUnitAdapter.tracks.values()
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
                            const pitch = note.pitch + transpose.getValue()
                            const x = pianoLayout.getCenteredX(pitch) * actualWidth
                            // inverses the y-axis
                            const y0 = positionToY(note.complete + rawStart)
                            const y1 = positionToY(note.position + rawStart)
                            const isPlaying = y1 >= actualHeight
                            const fillStyle = pianoLayout.getFillStyle(hue, isPlaying)
                            context.lineWidth = 1.5 * devicePixelRatio
                            context.fillStyle = fillStyle
                            context.strokeStyle = "rgba(0, 0, 0, 0.66)"
                            context.save()
                            context.beginPath()
                            context.roundRect(x - noteWidth / 2, y0, noteWidth, y1 - y0, 3 * devicePixelRatio)
                            context.fill()
                            context.stroke()
                            context.clip()
                            if (labelEnabled) {
                                context.fillStyle = "rgba(0, 0, 0, 0.66)"
                                MidiKeys.Names[pitch % 12]
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
        pianoMode.subscribe(painter.requestUpdate)
    )
    return element
}