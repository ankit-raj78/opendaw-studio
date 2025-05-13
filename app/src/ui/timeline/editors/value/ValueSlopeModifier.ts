import {clamp, Iterables, Notifier, Observer, Option, Selection, Terminable, unitValue, ValueAxis} from "std"
import {Editing} from "box"
import {ValueEventBoxAdapter} from "@/audio-engine-shared/adapters/timeline/event/ValueEventBoxAdapter.ts"
import {EventCollection, ppqn, ValueEvent} from "dsp"
import {ValueModifier} from "./ValueModifier"
import {
    ValueEventCollectionBoxAdapter
} from "@/audio-engine-shared/adapters/timeline/collection/ValueEventCollectionBoxAdapter.ts"
import {ValueEventDraft} from "@/ui/timeline/editors/value/ValueEventDraft.ts"
import {ValueEventOwnerReader} from "../EventOwnerReader"
import {Dragging} from "dom"

type Construct = Readonly<{
    element: Element
    selection: Selection<ValueEventBoxAdapter>
    valueAxis: ValueAxis
    pointerValue: unitValue
    reference: ValueEventBoxAdapter
}>

export class ValueSlopeModifier implements ValueModifier {
    static create(construct: Construct): ValueSlopeModifier {return new ValueSlopeModifier(construct)}

    readonly #element: Element
    readonly #selection: Selection<ValueEventBoxAdapter>
    readonly #valueAxis: ValueAxis
    readonly #pointerValue: unitValue
    readonly #reference: ValueEventBoxAdapter

    readonly #notifier: Notifier<void>

    #deltaSlope: number

    private constructor({element, selection, valueAxis, pointerValue, reference}: Construct) {
        this.#element = element
        this.#selection = selection
        this.#valueAxis = valueAxis
        this.#pointerValue = pointerValue
        this.#reference = reference

        this.#notifier = new Notifier<void>()

        this.#deltaSlope = 0.0
    }

    subscribeUpdate(observer: Observer<void>): Terminable {return this.#notifier.subscribe(observer)}

    showOrigin(): boolean {return false}
    snapValue(): Option<unitValue> {return Option.None}
    translateSearch(value: ppqn): ppqn {return value}
    isVisible(_event: ValueEvent): boolean {return true}
    readPosition(event: ValueEvent): ppqn {return event.position}
    readValue(event: ValueEvent): unitValue {return event.value}
    readSlope(event: ValueEventBoxAdapter): unitValue {
        const successor = ValueEvent.nextEvent(this.#unwrapEventCollection(), event)
        if (successor === null) {return event.slope} // last event has no successor hence no curve
        return clamp(event.slope - this.#deltaSlope * Math.sign(event.value - successor.value), 0.0, 1.0)
    }
    readContentDuration(owner: ValueEventOwnerReader): number {return owner.contentDuration}
    iterator(searchMin: ppqn, searchMax: ppqn): IteratorObject<ValueEventDraft> {
        return Iterables.map(ValueEvent.iterateWindow(this.#unwrapEventCollection(), searchMin, searchMax), event => ({
            type: "value-event",
            position: event.position,
            value: event.value,
            slope: event.isSelected ? this.readSlope(event) : event.slope,
            interpolation: event.interpolation,
            index: event.index,
            isSelected: event.isSelected,
            direction: 0
        }))
    }

    update({clientY}: Dragging.Event): void {
        const clientRect = this.#element.getBoundingClientRect()
        const localY = clientY - clientRect.top
        const deltaSlope: number = this.#valueAxis.axisToValue(localY) - this.#pointerValue
        if (this.#deltaSlope !== deltaSlope) {
            this.#deltaSlope = deltaSlope
            this.#dispatchChange()
        }
    }

    approve(editing: Editing): void {
        if (this.#deltaSlope === 0.0) {
            return
        }
        const result: ReadonlyArray<{
            event: ValueEventBoxAdapter,
            slope: unitValue
        }> = this.#selection.selected().map(event => ({
            event, slope: this.readSlope(event)
        }))
        editing.modify(() => result.forEach(({event, slope}) => event.box.slope.setValue(slope)))
    }

    cancel(): void {
        this.#deltaSlope = 0.0
        this.#dispatchChange()
    }

    #dispatchChange(): void {this.#notifier.notify()}

    #unwrapCollection(): ValueEventCollectionBoxAdapter {return this.#reference.collection.unwrap()}
    #unwrapEventCollection(): EventCollection<ValueEventBoxAdapter> {return this.#unwrapCollection().events}
}