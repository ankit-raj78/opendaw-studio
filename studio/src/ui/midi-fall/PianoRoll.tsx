import css from "./PianoRoll.sass?inline"
import {Html} from "dom"
import {createElement, Group} from "jsx"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {isDefined, isInstanceOf, Lifecycle, ObservableValue} from "std"
import {StudioService} from "@/service/StudioService.ts"
import {LoopableRegion, ppqn} from "dsp"
import {NoteRegionBoxAdapter} from "@/audio-engine-shared/adapters/timeline/region/NoteRegionBoxAdapter.ts"

const className = Html.adoptStyleSheet(css, "PianoRoll")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    pianoLayoutOwner: ObservableValue<PianoRollLayout>
}

export const PianoRoll = ({lifecycle, service, pianoLayoutOwner}: Construct) => {
    const {WhiteKey, BlackKey} = PianoRollLayout
    const enginePosition = service.engine.position()
    const createSVG = (pianoLayout: PianoRollLayout): SVGSVGElement => (
        <svg classList={className}
             viewBox={`0.5 0 ${pianoLayout.whiteKeys.length * WhiteKey.width - 1} ${(WhiteKey.height)}`}
             width="100%">
            {pianoLayout.whiteKeys.map(({key, x}) => (
                <rect classList="white" data-key={key} x={x + 0.5} y={0}
                      width={WhiteKey.width - 1} height={WhiteKey.height}/>
            ))}
            {pianoLayout.blackKeys.map(({key, x}) => (
                <rect classList="black" data-key={key} x={x} y={0}
                      width={BlackKey.width} height={BlackKey.height}/>
            ))}
        </svg>
    )

    let svg = createSVG(pianoLayoutOwner.getValue())

    const update = (position: ppqn) => {
        svg.querySelectorAll<SVGRectElement>("rect.playing")
            .forEach(rect => {
                rect.style.removeProperty("fill")
                rect.classList.remove("playing")
            })
        if (!service.hasProjectSession) {return}
        const pianoLayout = pianoLayoutOwner.getValue()
        const {project} = service
        project.rootBoxAdapter.audioUnits.adapters().forEach(adapter => {
            const trackBoxAdapters = adapter.tracks.values()
            trackBoxAdapters.forEach((trackAdapter, index) => {
                const hue = index / trackBoxAdapters.length * 360
                const region = trackAdapter.regions.collection.lowerEqual(position)
                if (region === null || !isInstanceOf(region, NoteRegionBoxAdapter) || position >= region.complete) {
                    return
                }
                const collection = region.optCollection.unwrap()
                const events = collection.events
                for (const {
                    resultStart,
                    resultEnd,
                    rawStart
                } of LoopableRegion.locateLoops(region, position, position)) {
                    const searchStart = Math.floor(resultStart - rawStart)
                    const searchEnd = Math.floor(resultEnd - rawStart)
                    for (const note of events.iterateRange(searchStart - collection.maxDuration, searchEnd)) {
                        if (note.position + rawStart <= position && position < note.complete + rawStart) {
                            const rect = svg.querySelector<SVGRectElement>(`[data-key="${note.pitch}"]`)
                            if (isDefined(rect)) {
                                rect.style.fill = pianoLayout.getFillStyle(hue, true)
                                rect.classList.add("playing")
                            }
                        }
                    }
                }
            })
        })
    }
    const placeholder: Element = <Group>{svg}</Group>
    lifecycle.ownAll(
        enginePosition.subscribe(owner => update(owner.getValue())),
        pianoLayoutOwner.subscribe(owner => {
            svg.remove()
            svg = createSVG(owner.getValue())
            placeholder.appendChild(svg)
        })
    )
    update(enginePosition.getValue())
    return placeholder
}