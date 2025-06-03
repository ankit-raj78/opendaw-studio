import css from "./MidiFallPage.sass?inline"
import {createElement, Group, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {PianoRoll} from "@/ui/midi-fall/PianoRoll.tsx"
import {NoteFall} from "@/ui/midi-fall/NoteFall.tsx"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {Projects} from "@/project/Projects"
import {clamp, DefaultObservableValue, UUID} from "std"
import {NumberInput} from "@/ui/components/NumberInput.tsx"
import {Checkbox} from "@/ui/components/Checkbox.tsx"
import {Icon} from "@/ui/components/Icon.tsx"
import {IconSymbol} from "@/IconSymbol.ts"
import {RadioGroup} from "@/ui/components/RadioGroup.tsx"

const className = Html.adoptStyleSheet(css, "MidiFallPage")

// TODO
//  [ ] Allow 90degrees rotation
//  [ ] Show timeline navigation
//  [ ] Open MidiFall view (or Piano Tutorial Mode?)
//  [ ] dialog to map note tracks to colors
//  [ ] store mapping in the project
//  [ ] Go back to timeline view
//  [X] labels on falling notes (~~Hide when note is too short~~ clip)
//  [X] control to adjust visible time range
//  [X] active piano colors
//  [X] different keyboard layouts https://familypiano.com/blog/piano-keys-faq/
//  [X] time signature / octave (C, F) grid
//  [ ] Playfield: Samples appear louder when polyphone

export const MidiFallPage: PageFactory<StudioService> = ({lifecycle, service}: PageContext<StudioService>) => {
    // TODO WORK IN PROGRESS
    // const uuid = "f9904790-66be-486c-b667-8d4810d7c68c"
    const uuid = "ca0a7df4-f5cf-4ebf-a8d0-80745c7beb4c"
    Projects.loadProject(service, UUID.parse(uuid))
        .then(project => {
            service.sessionService.fromProject(project, "MidiFall")
        }, console.warn)

    const pianoRollDefaults = PianoRollLayout.Defaults()
    const timeScale = new DefaultObservableValue(8, {guard: value => clamp(value, 1, 16)})
    const noteScale = new DefaultObservableValue(150, {guard: value => clamp(value, 50, 200)})
    const noteLabels = new DefaultObservableValue(true)
    const pianoLayout = new DefaultObservableValue<PianoRollLayout>(pianoRollDefaults[88])
    const element: HTMLElement = (
        <div className={className}>
            <NoteFall lifecycle={lifecycle} service={service} pianoLayoutOwner={pianoLayout}
                      timeScaleOwner={timeScale}
                      noteScaleOwner={noteScale}
                      noteLabelsOwner={noteLabels}/>
            <PianoRoll lifecycle={lifecycle} service={service} pianoLayoutOwner={pianoLayout}/>
            <div className="controls">
                <Group>
                    <span>Keyboard</span>
                    <RadioGroup lifecycle={lifecycle}
                                model={pianoLayout}
                                elements={[
                                    {element: <span>88</span>, value: pianoRollDefaults[88]},
                                    {element: <span>76</span>, value: pianoRollDefaults[76]},
                                    {element: <span>61</span>, value: pianoRollDefaults[61]},
                                    {element: <span>49</span>, value: pianoRollDefaults[49]}
                                ]}/>
                    <span>Time Scale</span>
                    <NumberInput lifecycle={lifecycle} model={timeScale}/>
                    <span>Note Width</span>
                    <NumberInput lifecycle={lifecycle} model={noteScale}/>
                    <span>Note Labels</span>
                    <Checkbox lifecycle={lifecycle} model={noteLabels}>
                        <Icon symbol={IconSymbol.Checkbox}/>
                    </Checkbox>
                </Group>
            </div>
        </div>
    )
    return element
}