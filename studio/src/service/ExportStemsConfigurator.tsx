import css from "./ExportStemsConfigurator.sass?inline"
import {Html} from "dom"
import {createElement, Frag} from "jsx"
import {Checkbox} from "@/ui/components/Checkbox"
import {DefaultObservableValue, Lifecycle} from "std"
import {IconSymbol} from "@/IconSymbol"
import {Icon} from "@/ui/components/Icon"
import {TextInput} from "@/ui/components/TextInput"
import {ExportStemsConfiguration} from "@/audio-engine-shared/EngineProcessorOptions"
import {ColorCodes} from "@/ui/mixer/ColorCodes"
import {Colors} from "@/ui/Colors"
import {AudioUnitType} from "@/data/enums"


export type EditableExportStemsConfiguration = ExportStemsConfiguration & Record<string, {
    readonly type: AudioUnitType
    label: string
    include: boolean
}>

type Construct = {
    lifecycle: Lifecycle
    configuration: EditableExportStemsConfiguration
}

export const ExportStemsConfigurator = ({lifecycle}: Construct) => {
    const enableBounceStems = new DefaultObservableValue(false)
    const enableBounceAll = new DefaultObservableValue(false)
    const enableBounceSelected = new DefaultObservableValue(false)
    const enableBounceIndividual = new DefaultObservableValue(false)
    const exportPath = new DefaultObservableValue("")
    
    return (
        <div>
            <h3>Export Configuration</h3>
            {Checkbox({
                lifecycle,
                model: enableBounceStems,
                appearance: {
                    activeColor: Colors.blue,
                    cursor: "pointer" as const
                }
            }, [
                (<span>Bounce Stems</span>) as any,
                (<span style={{color: Colors.gray}}>Export individual track stems</span>) as any
            ] as any)}
            
            {Checkbox({
                lifecycle,
                model: enableBounceAll,
                appearance: {
                    activeColor: Colors.blue,
                    cursor: "pointer" as const
                }
            }, [
                (<span>Bounce All</span>) as any,
                (<span style={{color: Colors.gray}}>Export complete mix</span>) as any
            ] as any)}
            
            {Checkbox({
                lifecycle,
                model: enableBounceSelected,
                appearance: {
                    activeColor: Colors.blue
                }
            }, [
                (<span>Bounce Selected</span>) as any,
                (<span style={{color: Colors.gray}}>Export selected tracks only</span>) as any
            ] as any)}
            
            {Checkbox({
                lifecycle,
                model: enableBounceIndividual,
                appearance: {
                    activeColor: Colors.blue
                }
            }, [
                (<span>Bounce Individual</span>) as any,
                (<span style={{color: Colors.gray}}>Export each track separately</span>) as any
            ] as any)}
            
            <div style={{marginTop: "1em"}}>
                <label>Export Path:</label>
                {(Frag as any)({}, [
                    TextInput({
                        lifecycle,
                        model: exportPath,
                        className: "export-path",
                        maxChars: 200
                    }) as any,
                    Checkbox({
                        lifecycle,
                        model: enableBounceAll,
                        appearance: {activeColor: Colors.blue}
                    }, (<span>Use default path</span>) as any) as any,
                    Checkbox({
                        lifecycle,
                        model: enableBounceSelected,
                        appearance: {activeColor: Colors.blue}
                    }, (<span>Ask for path each time</span>) as any) as any,
                    Checkbox({
                        lifecycle,
                        model: enableBounceIndividual,
                        appearance: {activeColor: Colors.blue}
                    }, (<span>Remember last path</span>) as any) as any
                ] as any)}
            </div>
        </div>
    )
}