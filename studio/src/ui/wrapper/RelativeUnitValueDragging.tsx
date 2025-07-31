import {EmptyExec, Lifecycle, Nullable, Option, panic, Parameter, Primitive, Strings, unitValue, ValueGuide} from "std"
import {createElement, Group, JsxValue} from "jsx"
import {ValueDragging} from "@/ui/hooks/dragging"
import {FloatingTextInput} from "@/ui/components/FloatingTextInput.tsx"
import {ValueTooltip} from "@/ui/surface/ValueTooltip.tsx"
import {Surface} from "../surface/Surface"
import {Editing} from "box"
import {Events} from "dom"

type Construct = {
    lifecycle: Lifecycle
    editing: Editing
    parameter: Parameter<Primitive>
    options?: ValueGuide.Options
}

const lookForSolidElement = (element: Element): Element => {
    let elem: Nullable<Element> = element
    while (getComputedStyle(elem).display === "contents") {
        elem = elem.firstElementChild
        if (elem === null) {
            return panic("Illegal State. No solid element found.")
        }
    }
    return elem
}

export const RelativeUnitValueDragging = ({
                                              lifecycle,
                                              editing,
                                              parameter,
                                              options
                                          }: Construct, children: JsxValue) => {
    const element: HTMLElement = (<Group>{children}</Group>)
    lifecycle.ownAll(
        Events.subscribe(element, "dblclick", () => {
            const solid: Element = lookForSolidElement(element)
            const rect = solid.getBoundingClientRect()
            const printValue = parameter.getPrintValue()
            const resolvers = Promise.withResolvers<string>()
            resolvers.promise.then(value => {
                const withUnit = Strings.endsWithDigit(value) ? `${value}${printValue.unit}` : value
                editing.modify(() => parameter.setPrintValue(withUnit))
                editing.mark()
            }, EmptyExec)
            Surface.get(element).flyout.appendChild(
                <FloatingTextInput position={{x: rect.left, y: rect.top + (rect.height >> 1)}}
                                   value={printValue.value}
                                   unit={printValue.unit}
                                   resolvers={resolvers}/>
            )
        }),
        ValueTooltip.default(element, () => {
            const clientRect = lookForSolidElement(element).getBoundingClientRect()
            return ({
                clientX: clientRect.left + 8,
                clientY: clientRect.top + clientRect.height + 8,
                ...parameter.getPrintValue()
            })
        }),
        ValueDragging.installUnitValueRelativeDragging((_event: PointerEvent) => Option.wrap({
            start: (): unitValue => {
                element.classList.add("modifying")
                return parameter.getUnitValue()
            },
            modify: (value: unitValue) => editing.modify(() => parameter.setUnitValue(value), false),
            cancel: (prevValue: unitValue) => editing.modify(() => parameter.setUnitValue(prevValue), false),
            finalise: (_prevValue: unitValue, newValue: unitValue): void => {
                editing.mark()
                console.log('[RelativeUnitValueDragging] Parameter change finalised:', { parameterId: parameter.uuid, value: newValue })
                
                // 🚀 Broadcast parameter change to collaborators
                try {
                    const ws: any = (window as any).wsClient
                    console.log('[RelativeUnitValueDragging] WebSocket client status:', { 
                        exists: !!ws, 
                        isConnected: ws?.isConnected, 
                        hasSendUpdateTrack: typeof ws?.sendUpdateTrack === 'function'
                    })
                    
                    if (ws?.isConnected && typeof ws.sendUpdateTrack === 'function') {
                        const updateData = {
                            parameterId: parameter.uuid,
                            parameterType: 'parameter',
                            value: newValue,
                            timestamp: Date.now()
                        }
                        console.log('[RelativeUnitValueDragging] ✅ Sending parameter update:', updateData)
                        ws.sendUpdateTrack(updateData)
                        console.log('[RelativeUnitValueDragging] ✅ Parameter update sent successfully!')
                    } else {
                        console.warn('[RelativeUnitValueDragging] ❌ Cannot send parameter update - WebSocket not ready')
                    }
                } catch (err) {
                    console.error('[RelativeUnitValueDragging] ❌ Failed to send parameter update:', err)
                }
            },
            finally: (): void => element.classList.remove("modifying")
        }), element, options)
    )
    return element
}