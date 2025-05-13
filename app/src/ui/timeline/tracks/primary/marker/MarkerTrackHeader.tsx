import css from "./MarkerTrackHeader.sass?inline"
import {Html} from "dom"
import {createElement} from "jsx"

const className = Html.adoptStyleSheet(css, "MarkerTrackHeader")

export const MarkerTrackHeader = () => {
    return (<div className={className}>Markers</div>)
}