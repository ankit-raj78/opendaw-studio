import {DeviceBoxAdapter} from "@/audio-engine-shared/adapters/devices.ts"
import {AutomatableParameterFieldAdapter} from "@/audio-engine-shared/adapters/AutomatableParameterFieldAdapter.ts"

export type ValueAssignment = {
    device?: DeviceBoxAdapter
    adapter: AutomatableParameterFieldAdapter
}