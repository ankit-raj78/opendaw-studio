import { DeviceInterfaceKnobBox } from "@/data/boxes"
import { ModuleAdapter, Modules } from "@/audio-engine-shared/adapters/modular/module.ts"
import { ParameterFieldAdapter } from "@/audio-engine-shared/adapters/ParameterFieldAdapter.ts"
import { Address, Box, PointerTypes, PrimitiveField } from "box"
import { BoxAdaptersContext } from "@/audio-engine-shared/BoxAdaptersContext"
import { BoxAdapter } from "@/audio-engine-shared/BoxAdapter"

export interface DeviceInterfaceElementAdapter extends BoxAdapter {
	get moduleAdapter(): ModuleAdapter
	get parameterAdapter(): ParameterFieldAdapter
}

export class DeviceInterfaceKnobAdapter implements DeviceInterfaceElementAdapter {
	readonly #context: BoxAdaptersContext
	readonly #box: DeviceInterfaceKnobBox

	constructor(context: BoxAdaptersContext, box: DeviceInterfaceKnobBox) {
		this.#context = context
		this.#box = box
	}

	get box(): Box<PointerTypes, any> {return this.#box}
	get uuid(): Readonly<Uint8Array> {return this.#box.address.uuid}
	get address(): Address {return this.#box.address}

	get moduleAdapter(): ModuleAdapter {
		return Modules.adapterFor(this.#context.boxAdapters, this.#parameterTarget.box)
	}

	get parameterAdapter(): ParameterFieldAdapter {
		return this.moduleAdapter.parameters.parameterAt(this.#parameterTarget.address.fieldKeys)
	}

	get #parameterTarget(): PrimitiveField {
		return this.#box.parameter.targetVertex.unwrap("Parameter not assigned") as PrimitiveField
	}

	terminate(): void {
	}
}