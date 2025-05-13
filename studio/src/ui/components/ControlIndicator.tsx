import {Lifecycle} from "std"
import {ParameterFieldAdapter} from "@/audio-engine-shared/adapters/ParameterFieldAdapter"
import {createElement, Group, JsxValue} from "jsx"

type Construct = {
    lifecycle: Lifecycle
    parameter: ParameterFieldAdapter
}

export const ControlIndicator = ({lifecycle, parameter}: Construct, children: JsxValue) => {
    const element: HTMLElement = <Group>{children}</Group>
    lifecycle.own(parameter.catchupAndSubscribeControlSources({
        onControlSourceAdd: () => element.classList.add("automated"),
        onControlSourceRemove: () => element.classList.remove("automated")
    }))
    return element
}