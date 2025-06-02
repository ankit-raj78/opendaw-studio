import css from "./MidiFallPage.sass?inline"
import {createElement, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"

const className = Html.adoptStyleSheet(css, "MidiFallPage")

export const MidiFallPage: PageFactory<StudioService> = ({service}: PageContext<StudioService>) => {
    return (
        <div className={className}>
            <h1>MidiFallPage</h1>
        </div>
    )
}