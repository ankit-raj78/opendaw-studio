import css from "./FlexSpace.sass?inline"
import {createElement} from "jsx"
import {Html} from "dom"

const className = Html.adoptStyleSheet(css, "FlexSpace")

export const FlexSpace = () => {
    return (
        <div className={className}/>
    )
}