import css from "./PianoRoll.sass?inline"
import {Html} from "dom"
import {createElement} from "jsx"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {isDefined, isInstanceOf, Lifecycle} from "std"
import {StudioService} from "@/service/StudioService.ts"
import {LoopableRegion, ppqn} from "dsp"
import {NoteRegionBoxAdapter} from "@/audio-engine-shared/adapters/timeline/region/NoteRegionBoxAdapter.ts"

const className = Html.adoptStyleSheet(css, "PianoRoll")

type Construct = {
    lifecycle: Lifecycle
    layout: PianoRollLayout
    service: StudioService
}

export const PianoRoll = ({lifecycle, layout, service}: Construct) => {
    const {WhiteKey, BlackKey} = PianoRollLayout
    const enginePosition = service.engine.position()
    const svg: SVGSVGElement = (
        <svg classList={className}
             viewBox={`0.5 0 ${layout.whiteKeys.length * WhiteKey.width - 1} ${(WhiteKey.height)}`}
             width="100%">
            {layout.whiteKeys.map(({key, x}) => (
                <rect classList="white" data-key={key} x={x + 0.5} y={0}
                      width={WhiteKey.width - 1} height={WhiteKey.height}/>
            ))}
            {layout.blackKeys.map(({key, x}) => (
                <rect classList="black" data-key={key} x={x} y={0}
                      width={BlackKey.width} height={BlackKey.height}/>
            ))}
        </svg>
    )

    const update = (position: ppqn) => {
        svg.querySelectorAll<SVGRectElement>("rect.playing").forEach(rect => {
            rect.style.removeProperty("fill")
            rect.classList.remove("playing")
        })
        if (!service.hasProjectSession) {return}
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
                                rect.style.fill = layout.getFillStyle(hue, true)
                                rect.classList.add("playing")
                            }
                        }
                    }
                }
            })
        })
    }
    lifecycle.ownAll(
        enginePosition.subscribe(owner => update(owner.getValue()))
    )
    return svg
}