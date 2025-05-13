import {ParameterFieldAdapter} from "@/audio-engine-shared/adapters/ParameterFieldAdapter.ts"
import {Editing, PrimitiveValues} from "box"
import {MutableObservableValue, ObservableValue, Observer, Subscription} from "std"

export namespace ParameterWrapper {
    export const makeEditable = <T extends PrimitiveValues>(editing: Editing,
                                                            adapter: ParameterFieldAdapter<T>): MutableObservableValue<T> =>
        new class implements MutableObservableValue<T> {
            getValue(): T {
                return adapter.getControlledValue()
            }
            setValue(value: T) {
                if (editing.canModify()) {
                    editing.modify(() => adapter.setValue(value))
                } else {
                    adapter.setValue(value)
                }
            }
            subscribe(observer: Observer<ObservableValue<T>>): Subscription {
                return adapter.subscribe(() => observer(this))
            }
            catchupAndSubscribe(observer: Observer<ObservableValue<T>>): Subscription {
                return adapter.catchupAndSubscribe(observer)
            }
        }
}