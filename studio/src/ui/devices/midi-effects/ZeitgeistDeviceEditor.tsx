import css from "./ZeitgeistDeviceEditor.sass?inline"
import {
    ZeitgeistDeviceBoxAdapter
} from "@/audio-engine-shared/adapters/devices/midi-effects/ZeitgeistDeviceBoxAdapter.ts"
import {Lifecycle} from "std"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {Project} from "@/project/Project.ts"
import {createElement} from "jsx"
import {ControlBuilder} from "@/ui/devices/ControlBuilder.tsx"
import {DeviceMidiMeter} from "@/ui/devices/panel/DeviceMidiMeter.tsx"
import {Html} from "dom"
import {Effects} from "@/service/Effects"
import {DeviceHost} from "@/audio-engine-shared/adapters/devices"
import {GrooveShuffleBoxAdapter} from "@/audio-engine-shared/adapters/grooves/GrooveShuffleBoxAdapter"

const className = Html.adoptStyleSheet(css, "ZeitgeistDeviceEditor")

type Construct = {
    lifecycle: Lifecycle
    project: Project
    adapter: ZeitgeistDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const ZeitgeistDeviceEditor = ({lifecycle, project, adapter, deviceHost}: Construct) => {
    const {amount, duration} = (adapter.groove() as GrooveShuffleBoxAdapter).namedParameter // TODO
    const {editing, midiDevices} = project
    return (
        <DeviceEditor lifecycle={lifecycle}
                      project={project}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forEffectDevice(parent, project, deviceHost, adapter)}
                      populateControls={() => (
                          <div className={className}>
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiDevices,
                                  adapter,
                                  parameter: amount
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiDevices,
                                  adapter,
                                  parameter: duration
                              })}
                          </div>
                      )}
                      populateMeter={() => (
                          <DeviceMidiMeter lifecycle={lifecycle}
                                           receiver={project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={Effects.MidiNamed.Zeitgeist.icon}/>
    )
}