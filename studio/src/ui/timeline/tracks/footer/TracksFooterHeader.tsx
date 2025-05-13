import css from "./TracksFooterHeader.sass?inline"
import {Html} from "dom"
import {createElement} from "jsx"

const className = Html.adoptStyleSheet(css, "TracksFooterHeader")

export const TracksFooterHeader = () => {
    return (<div className={className}/>)
}