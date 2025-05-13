import {ContextMenu} from "@/ui/ContextMenu.ts"
import {MenuItem} from "@/ui/model/menu-item.ts"
import {ElementCapturing} from "@/ui/canvas/capturing.ts"
import {Editing} from "box"
import {Selection} from "std"
import {ValueEventBoxAdapter} from "@/audio-engine-shared/adapters/timeline/event/ValueEventBoxAdapter.ts"
import {ValueCaptureTarget} from "@/ui/timeline/editors/value/ValueEventCapturing.ts"
import {Interpolation} from "dsp"

type Construct = {
    element: Element
    capturing: ElementCapturing<ValueCaptureTarget>
    editing: Editing
    selection: Selection<ValueEventBoxAdapter>
}

export const installValueContextMenu = ({element, capturing, editing, selection}: Construct) =>
    ContextMenu.subscribe(element, ({addItems, client}: ContextMenu.Collector) => {
        const target = capturing.captureEvent(client)
        if (target === null || target.type === "loop-duration") {return}
        if ("event" in target && !selection.isSelected(target.event)) {
            selection.deselectAll()
            selection.select(target.event)
        }
        addItems(
            MenuItem.default({label: "Delete"})
                .setTriggerProcedure(() => editing.modify(() => selection.selected()
                    .forEach(adapter => adapter.box.delete()))),
            MenuItem.default({label: "Interpolation"})
                .setRuntimeChildrenProcedure(parent => parent.addMenuItem(
                    MenuItem.default({
                        label: "None",
                        checked: target.event.interpolation === Interpolation.None
                    }).setTriggerProcedure(() => editing.modify(() => selection.selected()
                        .forEach(adapter => {
                            adapter.box.slope.setValue(0.5)
                            adapter.box.interpolation.setValue(Interpolation.None)
                        }))),
                    MenuItem.default({
                        label: "Default (Linear, Curve)",
                        checked: target.event.interpolation === Interpolation.Default
                    }).setTriggerProcedure(() => editing.modify(() => selection.selected()
                        .forEach(adapter => adapter.box.interpolation.setValue(Interpolation.Default))))
                )),
            MenuItem.default({
                label: "Curve to Line",
                selectable: target.event.slope !== 0.5
            }).setTriggerProcedure(() => editing.modify(() => selection.selected()
                .forEach(adapter => adapter.box.slope.setValue(0.5)))),
            MenuItem.default({label: "Print events to console"})
                .setTriggerProcedure(() => {
                    console.debug(target.event.collection.unwrap().events.asArray()
                        .map(({position, index, value, slope, interpolation}) =>
                            `{position: ${position}, index: ${index}, value: ${value}, slope: ${slope}, interpolation: ${interpolation}}`)
                        .join(",\n"))
                })
        )
    })