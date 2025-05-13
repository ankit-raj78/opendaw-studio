import {FieldKeys, PointerTypes, PrimitiveField, PrimitiveValues} from "box"
import {assert, NumberArrayComparator, SortedSet, StringMapping, Terminable, unitValue, ValueMapping} from "std"
import {ParameterFieldAdapter} from "./ParameterFieldAdapter.ts"

import {BoxAdaptersContext} from "@/audio-engine-shared/BoxAdaptersContext"

export class ParameterAdapterSet implements Terminable {
    readonly #context: BoxAdaptersContext
    readonly #parameters: SortedSet<FieldKeys, ParameterFieldAdapter>

    constructor(context: BoxAdaptersContext) {
        this.#context = context
        this.#parameters = new SortedSet(adapter => adapter.address.fieldKeys, NumberArrayComparator)
    }

    terminate(): void {
        this.#parameters.forEach(parameter => parameter.terminate())
        this.#parameters.clear()
    }

    parameters(): ReadonlyArray<ParameterFieldAdapter> {return this.#parameters.values()}
    parameterAt(fieldIndices: FieldKeys): ParameterFieldAdapter {
        return this.#parameters.getOrThrow(fieldIndices,
            () => new Error(`No ParameterAdapter found at [${fieldIndices}]`))
    }

    createParameter<T extends PrimitiveValues>(
        field: PrimitiveField<T, PointerTypes>,
        valueMapping: ValueMapping<T>,
        stringMapping: StringMapping<T>,
        name: string,
        anchor?: unitValue): ParameterFieldAdapter<T> {
        const adapter = new ParameterFieldAdapter<T>(this.#context, field, valueMapping, stringMapping, name, anchor)
        const added = this.#parameters.add(adapter)
        assert(added, `Could not add adapter for ${field}`)
        return adapter
    }

    removeParameter<T extends PrimitiveValues>(parameter: ParameterFieldAdapter<T>): void {
        this.#parameters.removeByValue(parameter)
    }
}