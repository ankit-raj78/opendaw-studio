import {SortedSet, Terminable} from "std"
import {Address} from "box"
import {ParameterFieldAdapter} from "@/audio-engine-shared/adapters/ParameterFieldAdapter.ts"

export class ParameterFieldAdapters {
    readonly #set: SortedSet<Address, ParameterFieldAdapter>

    constructor() {
        this.#set = Address.newSet<ParameterFieldAdapter>(adapter => adapter.field.address)
    }

    register(adapter: ParameterFieldAdapter): Terminable {
        this.#set.add(adapter)
        return {terminate: () => this.#set.removeByValue(adapter)}
    }

    get(address: Address): ParameterFieldAdapter {return this.#set.get(address)}
}