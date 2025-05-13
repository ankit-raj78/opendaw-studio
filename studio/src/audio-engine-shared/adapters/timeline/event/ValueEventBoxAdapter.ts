import {Interpolation, ppqn, ValueEvent} from "dsp"
import {Arrays, Comparator, int, Option, Selectable, Subscription, unitValue, UUID} from "std"
import {Address, Field, Propagation, Update} from "box"
import {Pointers} from "@/data/pointers.ts"
import {ValueEventBox} from "@/data/boxes/ValueEventBox.ts"
import {ValueEventCollectionBoxAdapter} from "../collection/ValueEventCollectionBoxAdapter.ts"
import {BoxAdaptersContext} from "@/audio-engine-shared/BoxAdaptersContext"
import {BoxAdapter} from "@/audio-engine-shared/BoxAdapter"

type CopyToParams = {
    position?: ppqn,
    index?: int,
    slope?: unitValue,
    value?: unitValue,
    interpolation?: Interpolation,
    events?: Field<Pointers.ValueEvents>
}

export class ValueEventBoxAdapter implements ValueEvent, BoxAdapter, Selectable {
    static readonly Comparator: Comparator<ValueEventBoxAdapter> = (a, b) => {
        const positionDiff = a.position - b.position
        if (positionDiff !== 0) {return positionDiff}
        const indexDiff = a.index - b.index
        if (indexDiff !== 0) {return indexDiff}
        throw new Error(`${a} and ${b} are identical in terms of comparation`)
    }

    readonly type = "value-event"

    readonly #context: BoxAdaptersContext
    readonly #box: ValueEventBox

    readonly #subscription: Subscription

    #isSelected: boolean = false

    constructor(context: BoxAdaptersContext, box: ValueEventBox) {
        this.#context = context
        this.#box = box

        this.#subscription = this.#box.subscribe(Propagation.Children, (update: Update) => {
            if (this.collection.isEmpty()) {return}
            if (update.type === "primitive" || update.type === "pointer") {
                const collection = this.collection.unwrap()
                const updatedFieldKeys = update.address.fieldKeys
                const indexChanged = Arrays.equals(this.#box.index.address.fieldKeys, updatedFieldKeys)
                const positionChanged = Arrays.equals(this.#box.position.address.fieldKeys, updatedFieldKeys)
                if (indexChanged || positionChanged) {
                    collection.requestSorting()
                } else {
                    collection.onEventPropertyChanged()
                }
            }
        })
    }

    onSelected(): void {
        this.#isSelected = true
        this.collection.ifSome(region => region.onEventPropertyChanged())
    }
    onDeselected(): void {
        this.#isSelected = false
        this.collection.ifSome(region => region.onEventPropertyChanged())
    }

    terminate(): void {this.#subscription.terminate()}

    get box(): ValueEventBox {return this.#box}
    get uuid(): UUID.Format {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get position(): int {return this.#box.position.getValue()}
    get index(): int {return this.#box.index.getValue()}
    get interpolation(): int {return this.#box.interpolation.getValue()}
    get value(): int {return this.#box.value.getValue()}
    get slope(): int {return this.#box.slope.getValue()}
    get isSelected(): boolean {return this.#isSelected}
    get collection(): Option<ValueEventCollectionBoxAdapter> {
        return this.#box.events.targetVertex
            .map(vertex => this.#context.boxAdapters.adapterFor(vertex.box, ValueEventCollectionBoxAdapter))
    }

    copyTo(options?: CopyToParams): ValueEventBoxAdapter {
        return this.#context.boxAdapters.adapterFor(ValueEventBox.create(this.#context.boxGraph, UUID.generate(), box => {
            box.position.setValue(options?.position ?? this.position)
            box.index.setValue(options?.index ?? this.index)
            box.events.refer(options?.events ?? this.collection.unwrap().box.events)
            box.interpolation.setValue(options?.interpolation ?? this.interpolation)
            box.value.setValue(options?.value ?? this.value)
            box.slope.setValue(options?.slope ?? this.slope)
        }), ValueEventBoxAdapter)
    }

    copyFrom(options?: CopyToParams): this {
        this.#box.position.setValue(options?.position ?? this.position)
        this.#box.index.setValue(options?.index ?? this.index)
        this.#box.events.refer(options?.events ?? this.collection.unwrap().box.events)
        this.#box.interpolation.setValue(options?.interpolation ?? this.interpolation)
        this.#box.value.setValue(options?.value ?? this.value)
        this.#box.slope.setValue(options?.slope ?? this.slope)
        return this
    }

    toString(): string {return `{ValueEventBoxAdapter position: ${this.position} index: ${this.index}}`}
}