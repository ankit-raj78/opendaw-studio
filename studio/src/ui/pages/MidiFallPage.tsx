import css from "./MidiFallPage.sass?inline"
import {createElement, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {PianoRoll} from "@/ui/midi-fall/PianoRoll.tsx"
import {NoteFall} from "@/ui/midi-fall/NoteFall.tsx"
import {PianoRollLayout} from "@/ui/midi-fall/PianoRollLayout.ts"
import {Projects} from "@/project/Projects"
import {UUID} from "std"

const className = Html.adoptStyleSheet(css, "MidiFallPage")

// TODO
//  labels on falling notes
//  control to adjust visible time range
//  active piano colors
//  dialog to map note tracks to colors
//  store mapping in the project
//  different keyboard layouts https://familypiano.com/blog/piano-keys-faq/
//  Allow 90degrees rotation
//  [X] time signature / octave (C, F) grid
//  Show timeline navigation
//  Open MidiFall view (or Piano Tutorial Mode?)
//  Go back to timeline view

export const MidiFallPage: PageFactory<StudioService> = ({lifecycle, service}: PageContext<StudioService>) => {
    // TODO WORK IN PROGRESS
    // Projects.loadProject(service, UUID.parse("f9904790-66be-486c-b667-8d4810d7c68c"))
    // Projects.loadProject(service, UUID.parse("68459e31-e40e-4c70-9ae0-6c8502b4d8c0"))
    const load = false // You need to find the uuid of your project stored in your opfs
    if (load) {
        Projects.loadProject(service, UUID.parse("ca0a7df4-f5cf-4ebf-a8d0-80745c7beb4c"))
            .then(project => {
                service.sessionService.fromProject(project, "MidiFall")
            })
    }

    const layout = new PianoRollLayout()
    return (
        <div className={className}>
            <NoteFall lifecycle={lifecycle} layout={layout} service={service}/>
            <PianoRoll lifecycle={lifecycle} layout={layout} service={service}/>
        </div>
    )
}