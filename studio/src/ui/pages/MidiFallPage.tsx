import css from "./MidiFallPage.sass?inline"
import {createElement, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {PianoRoll} from "@/ui/components/PianoRoll.tsx"

const className = Html.adoptStyleSheet(css, "MidiFallPage")

export const MidiFallPage: PageFactory<StudioService> = ({service}: PageContext<StudioService>) => {
    return (
        <div className={className}>
            <PianoRoll/>
        </div>
    )
}