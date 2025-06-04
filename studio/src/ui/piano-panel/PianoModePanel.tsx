import css from "./PianoModePanel.sass?inline"
import {createElement, Group} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {PianoRoll} from "@/ui/piano-panel/PianoRoll.tsx"
import {NoteFall} from "@/ui/piano-panel/NoteFall.tsx"
import {Lifecycle} from "std"
import {NumberInput} from "@/ui/components/NumberInput.tsx"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {IconSymbol} from "@/IconSymbol.ts"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"
import {EditWrapper} from "@/ui/wrapper/EditWrapper.ts"

const className = Html.adoptStyleSheet(css, "PianoModePanel")

// TODO
//  [ ] Show timeline navigation
//  [ ] dialog? to disable note tracks
//  [ ] Different note labels for different countries (Global Switch)
//  [ ] Control to show and edit signature
//  [ ] Playfield: Samples appear louder when polyphone
//  [X] Scroll Y should change engine position (FW, RW)
//  [X] Rename to PianoModePanel
//  [X] Transpose
//  [X] Go back to timeline view
//  [X] Open MidiFall view (or Piano Tutorial Mode?)
//  [X] labels on falling notes (~~Hide when note is too short~~ clip)
//  [X] control to adjust visible time range
//  [X] active piano colors
//  [X] different keyboard layouts https://familypiano.com/blog/piano-keys-faq/
//  [X] time signature / octave (C, F) grid

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
    const element: HTMLElement = (
        <div className={className}>
            <NoteFall lifecycle={lifecycle} project={project}/>
            <PianoRoll lifecycle={lifecycle} project={project}/>
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
                </Group>
            </div>
        </div>
    )
    return element
}