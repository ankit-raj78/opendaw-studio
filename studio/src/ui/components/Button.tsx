import {Lifecycle, Procedure} from "std"
import {createElement, JsxValue} from "jsx"
import {Appearance, ButtonCheckboxRadio} from "@/ui/components/ButtonCheckboxRadio"
import {Html} from "dom"

export type ButtonParameters = {
    lifecycle: Lifecycle
    onClick: Procedure<MouseEvent>
    style?: Partial<CSSStyleDeclaration>
    appearance?: Appearance
}

export const Button = ({lifecycle, onClick, style, appearance}: ButtonParameters, children: JsxValue) => {
    const id = Html.nextID()
    const input: HTMLInputElement = <input type="button" id={id} onclick={onClick}/>
    return (
        <ButtonCheckboxRadio lifecycle={lifecycle} style={style} appearance={appearance} dataClass="button">
            {input}
            <label htmlFor={id}>{children}</label>
        </ButtonCheckboxRadio>
    )
}