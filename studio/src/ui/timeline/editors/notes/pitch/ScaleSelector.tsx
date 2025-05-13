import css from "./ScaleSelector.sass?inline"
import {Arrays, Lifecycle} from "std"
import {MenuButton} from "@/ui/components/MenuButton.tsx"
import {Colors} from "@/ui/Colors.ts"
import {createElement, Inject} from "jsx"
import {MidiKeys} from "dsp"
import {MenuItem} from "@/ui/model/menu-item.ts"
import {ScaleConfig} from "@/ui/timeline/editors/notes/pitch/ScaleConfig.ts"
import {Html} from "dom"

const className = Html.adoptStyleSheet(css, "ScaleSelector")

type Construct = {
    lifecycle: Lifecycle
    scale: ScaleConfig
}

export const ScaleSelector = ({lifecycle, scale}: Construct) => {
    const labelName = Inject.value(MidiKeys.Names[scale.key])
    lifecycle.own(scale.subscribe(() => {labelName.value = MidiKeys.Names[scale.key]}))
    return (
        <div className={className}>
            <MenuButton root={MenuItem.root().setRuntimeChildrenProcedure((parent: MenuItem) => {
                parent.addMenuItem(...Arrays.create(key => MenuItem.default({
                    label: MidiKeys.Names[key],
                    checked: key === scale.key
                }).setTriggerProcedure(() => scale.key = key), 12))
            })} appearance={{framed: true, color: Colors.dark, activeColor: Colors.gray}}>
                <label style={{padding: "0"}}><span>{labelName}</span></label>
            </MenuButton>
        </div>
    )
}