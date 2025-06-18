import {Interpolation, ppqn, ValueEvent} from "dsp"
import {Arrays, CacheValue, Comparator, int, Option, Selectable, Terminator, unitValue, UUID} from "std"
import {Address, Field, Propagation, Update} from "box"
import {Pointers} from "@/data/pointers.ts"
import {ValueEventBox} from "@/data/boxes/ValueEventBox.ts"
import {ValueEventCollectionBoxAdapter} from "../collection/ValueEventCollectionBoxAdapter.ts"
import {BoxAdaptersContext} from "@/audio-engine-shared/BoxAdaptersContext"
import {BoxAdapter} from "@/audio-engine-shared/BoxAdapter"
import {InterpolationFieldAdapter} from "@/audio-engine-shared/adapters/timeline/event/InterpolationFieldAdapter.ts"

type CopyToParams = {
    position?: ppqn,
    index?: int,
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
        throw new Error(`${a} and ${b} are identical in terms of comparison`)
    }

    readonly type = "value-event"

    readonly #terminator: Terminator = new Terminator()

    readonly #context: BoxAdaptersContext
    readonly #box: ValueEventBox

    readonly #interpolation: CacheValue<Interpolation>

    #isSelected: boolean = false

    constructor(context: BoxAdaptersContext, box: ValueEventBox) {
        this.#context = context
        this.#box = box

        this.#interpolation = this.#terminator.own(new CacheValue<Interpolation>(() =>
            InterpolationFieldAdapter.read(this.#box.interpolation)))

        this.#terminator.ownAll(
            this.#box.subscribe(Propagation.Children, (update: Update) => {
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
            }),
            this.#box.interpolation.subscribe(() => this.#interpolation.invalidate()),
            this.#box.interpolation.pointerHub.subscribeImmediate({
                onAdd: () => this.#interpolation.invalidate(),
                onRemove: () => this.#interpolation.invalidate()
            })
        )
    }

    onSelected(): void {
        this.#isSelected = true
        this.collection.ifSome(region => region.onEventPropertyChanged())
    }
    onDeselected(): void {
        this.#isSelected = false
        this.collection.ifSome(region => region.onEventPropertyChanged())
    }

    terminate(): void {this.#terminator.terminate()}

    get box(): ValueEventBox {return this.#box}
    get uuid(): UUID.Format {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get position(): int {return this.#box.position.getValue()}
    get index(): int {return this.#box.index.getValue()}
    set interpolation(value: Interpolation) {InterpolationFieldAdapter.write(this.#box.interpolation, value)}
    get interpolation(): Interpolation {return this.#interpolation.get()}
    get value(): int {return this.#box.value.getValue()}
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
            InterpolationFieldAdapter.write(box.interpolation, options?.interpolation ?? this.interpolation)
            box.value.setValue(options?.value ?? this.value)
        }), ValueEventBoxAdapter)
    }

    copyFrom(options?: CopyToParams): this {
        this.#box.position.setValue(options?.position ?? this.position)
        this.#box.index.setValue(options?.index ?? this.index)
        this.#box.events.refer(options?.events ?? this.collection.unwrap().box.events)
        InterpolationFieldAdapter.write(this.#box.interpolation, options?.interpolation ?? this.interpolation)
        this.#box.value.setValue(options?.value ?? this.value)
        return this
    }

    toString(): string {return `{ValueEventBoxAdapter position: ${this.position} index: ${this.index}}`}
}