import css from "./MidiFall.sass?inline"
import {createElement, Group} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {PianoRoll} from "@/ui/midi-fall/PianoRoll.tsx"
import {NoteFall} from "@/ui/midi-fall/NoteFall.tsx"
import {Lifecycle} from "std"
import {NumberInput} from "@/ui/components/NumberInput.tsx"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {IconSymbol} from "@/IconSymbol.ts"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"
import {Wrapper} from "@/ui/wrapper/Wrapper.ts"

const className = Html.adoptStyleSheet(css, "MidiFall")

// TODO
//  [ ] Allow 90degrees rotation
//  [ ] Show timeline navigation
//  [ ] dialog to map note tracks to colors
//  [ ] store mapping in the project
//  [X] Go back to timeline view
//  [X] Open MidiFall view (or Piano Tutorial Mode?)
//  [X] labels on falling notes (~~Hide when note is too short~~ clip)
//  [X] control to adjust visible time range
//  [X] active piano colors
//  [X] different keyboard layouts https://familypiano.com/blog/piano-keys-faq/
//  [X] time signature / octave (C, F) grid
//  [ ] Playfield: Samples appear louder when polyphone

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
}

export const MidiFall = ({lifecycle, service}: Construct) => {
    if (!service.hasProjectSession) {return "No session."}
    const {project} = service
    const {rootBoxAdapter, editing} = project
    const pianoMode = rootBoxAdapter.pianoMode
    const {keyboard, timeRangeInQuarters, noteScale, noteLabels} = pianoMode
    const element: HTMLElement = (
        <div className={className}>
            <NoteFall lifecycle={lifecycle} project={project}/>
            <PianoRoll lifecycle={lifecycle} project={project}/>
            <div className="controls">
                <Group>
                    <span>Keyboard</span>
                    <RadioGroup lifecycle={lifecycle}
                                model={Wrapper.makeEditable(editing, keyboard)}
                                elements={[
                                    {element: <span>88</span>, value: 0},
                                    {element: <span>76</span>, value: 1},
                                    {element: <span>61</span>, value: 2},
                                    {element: <span>49</span>, value: 3}
                                ]}/>
                    <span>Time Scale</span>
                    <NumberInput lifecycle={lifecycle}
                                 model={Wrapper.makeEditable(editing, timeRangeInQuarters)}/>
                    <span>Note Width</span>
                    <NumberInput lifecycle={lifecycle}
                                 model={Wrapper.makeEditable(editing, noteScale)} step={0.1}
                                 mapper={noteScale.stringMapping}/>
                    <span>Note Labels</span>
                    <Checkbox lifecycle={lifecycle}
                              model={Wrapper.makeEditable(editing, noteLabels)}>
                        <Icon symbol={IconSymbol.Checkbox}/>
                    </Checkbox>
                </Group>
            </div>
        </div>
    )
    return element
}