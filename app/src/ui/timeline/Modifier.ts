import {Dragging} from "dom"
import {Editing} from "box"

export interface Modifier {
    update(event: Dragging.Event): void
    approve(editing: Editing): void
    cancel(): void
}