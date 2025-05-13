import { DeviceBoxAdapter } from "@/audio-engine-shared/adapters/devices.ts"
import { ParameterFieldAdapter } from "@/audio-engine-shared/adapters/ParameterFieldAdapter.ts"

export type ValueAssignment = {
	device?: DeviceBoxAdapter
	adapter: ParameterFieldAdapter
}