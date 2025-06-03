import {Lifecycle, unitValue} from "std"
import {Knob} from "@/ui/components/Knob.tsx"
import {ParameterLabel} from "@/ui/components/ParameterLabel.tsx"
import {createElement} from "jsx"
import {AutomatableParameterFieldAdapter} from "@/audio-engine-shared/adapters/AutomatableParameterFieldAdapter.ts"
import {DeviceBoxAdapter} from "@/audio-engine-shared/adapters/devices.ts"
import {Editing} from "box"
import {MidiDevices} from "@/midi/devices/MidiDevices"

type Construct = {
    lifecycle: Lifecycle
    editing: Editing
    midiDevices: MidiDevices,
    adapter: DeviceBoxAdapter
    parameter: AutomatableParameterFieldAdapter
    anchor: unitValue
}

export const LabelKnob = ({lifecycle, editing, midiDevices, adapter, parameter, anchor}: Construct) => {
    return (
        <div style={{display: "contents"}}>
            <Knob lifecycle={lifecycle} value={parameter} anchor={anchor}/>
            <ParameterLabel lifecycle={lifecycle}
                            editing={editing}
                            midiDevices={midiDevices}
                            adapter={adapter}
                            parameter={parameter}/>
        </div>
    )
}