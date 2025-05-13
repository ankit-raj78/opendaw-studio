import css from "./TextButton.sass?inline"
import {Exec} from "std"
import {createElement} from "jsx"
import {Html} from "dom"

const className = Html.adoptStyleSheet(css, "TextButton")

export const TextButton = ({onClick}: { onClick: Exec }) => (
    <div className={className} onclick={onClick}/>
)