import css from "./PianoModePanel.sass?inline"
import {createElement, Group} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {deferNextFrame, Html} from "dom"
import {PianoRoll} from "@/ui/piano-panel/PianoRoll.tsx"
import {NoteFall} from "@/ui/piano-panel/NoteFall.tsx"
import {Lifecycle, Notifier} from "std"
import {NumberInput} from "@/ui/components/NumberInput.tsx"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {IconSymbol} from "@/IconSymbol.ts"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"
import {EditWrapper} from "@/ui/wrapper/EditWrapper.ts"
import {TrackType} from "@/audio-engine-shared/adapters/timeline/TrackType.ts"

const className = Html.adoptStyleSheet(css, "PianoModePanel")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const PianoModePanel = ({lifecycle, service}: Construct) => {
    if (!service.hasProjectSession) {return "No session."}
    const {project} = service
    const {rootBoxAdapter, editing} = project
    const pianoMode = rootBoxAdapter.pianoMode
    const {keyboard, timeRangeInQuarters, noteScale, noteLabels, transpose} = pianoMode
    const updateNotifier = lifecycle.own(new Notifier<void>())
    const notify = deferNextFrame(() => updateNotifier.notify())
    // TODO Listen to new tracks somehow (RootBoxAdapter) and then listen to their excludePianoMode field
    lifecycle.ownAll(
        service.engine.position().subscribe(notify.request),
        pianoMode.subscribe(notify.request)
    )
    return (
        <div className={className}>
            <NoteFall lifecycle={lifecycle} project={project} updateNotifier={updateNotifier}/>
            <PianoRoll lifecycle={lifecycle} project={project} updateNotifier={updateNotifier}/>
            <div className="controls">
                <Group>
                    <span>Keyboard</span>
                    <RadioGroup lifecycle={lifecycle}
                                model={EditWrapper.forValue(editing, keyboard)}
                                elements={[
                                    {element: <span>88</span>, value: 0},
                                    {element: <span>76</span>, value: 1},
                                    {element: <span>61</span>, value: 2},
                                    {element: <span>49</span>, value: 3}
                                ]}/>
                    <span>Time Scale</span>
                    <NumberInput lifecycle={lifecycle}
                                 model={EditWrapper.forValue(editing, timeRangeInQuarters)}/>
                    <span>Note Width</span>
                    <NumberInput lifecycle={lifecycle}
                                 model={EditWrapper.forValue(editing, noteScale)} step={0.1}
                                 mapper={noteScale.stringMapping}/>
                    <span>Transpose</span>
                    <NumberInput lifecycle={lifecycle}
                                 model={EditWrapper.forValue(editing, transpose)} step={1}
                                 mapper={transpose.stringMapping}/>
                    <span>Note Labels</span>
                    <Checkbox lifecycle={lifecycle}
                              model={EditWrapper.forValue(editing, noteLabels)}>
                        <Icon symbol={IconSymbol.Checkbox}/>
                    </Checkbox>
                    {
                        rootBoxAdapter.audioUnits.adapters()
                            .flatMap(audioUnitBoxAdapter => audioUnitBoxAdapter.tracks.values()
                                .filter(track => track.type === TrackType.Notes)
                                .map((track, index, array) => (
                                    <Group>
                                        <span>Exc. {
                                            // TODO This list will not scale and isn't very nice
                                            array.length === 1
                                                ? audioUnitBoxAdapter.label
                                                : `${(audioUnitBoxAdapter.label)} (${index + 1})`}</span>
                                        <Checkbox lifecycle={lifecycle}
                                                  model={EditWrapper.forValue(editing, track.box.excludePianoMode)}>
                                            <Icon symbol={IconSymbol.Checkbox}/>
                                        </Checkbox>
                                    </Group>
                                )))
                    }
                </Group>
            </div>
            {!rootBoxAdapter.audioUnits.adapters()
                .some(audioUnitBoxAdapter => audioUnitBoxAdapter.tracks.values()
                    .some(trackAdapter => trackAdapter.type === TrackType.Notes)) && (
                <div className="no-midi-track-label">No midi track found</div>
            )}
        </div>
    )
}