import {Box, Field} from "box"
import {
    ArpeggioDeviceBox,
    DelayDeviceBox,
    GrooveShuffleBox,
    ModularAudioInputBox,
    ModularAudioOutputBox,
    ModularBox,
    ModularDeviceBox,
    ModuleConnectionBox,
    PitchDeviceBox,
    RevampDeviceBox,
    ReverbDeviceBox,
    StereoToolDeviceBox,
    ZeitgeistDeviceBox
} from "@/data/boxes"
import {int, INVERSE_SQRT_2, UUID} from "std"
import {Project} from "@/project/Project.ts"
import {IconSymbol} from "@/IconSymbol"
import {EffectPointerType} from "@/audio-engine-shared/adapters/devices"

export namespace Effects {
    export interface Entry {
        get name(): string
        get description(): string
        get icon(): IconSymbol
        get separatorBefore(): boolean
        get type(): "audio" | "midi"

        create(project: Project, unit: Field<EffectPointerType>, index: int): Box
    }

    export const MidiNamed = {
        arpeggio: {
            name: "Arpeggio",
            description: "Generates rhythmic note sequences from chords",
            icon: IconSymbol.Stack,
            separatorBefore: false,
            type: "midi",
            create: ({boxGraph}, unit, index) => ArpeggioDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Arpeggio")
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        pitch: {
            name: "Pitch",
            description: "Shifts the pitch of incoming notes",
            icon: IconSymbol.Note,
            separatorBefore: false,
            type: "midi",
            create: ({boxGraph}, unit, index) => PitchDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Pitch")
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        Zeitgeist: {
            name: "Zeitgeist",
            description: "Distorts space and time",
            icon: IconSymbol.Zeitgeist,
            separatorBefore: false,
            type: "midi",
            create: ({boxGraph, rootBoxAdapter}, unit, index) => {
                const useGlobal = false // TODO First Zeitgeist should be true
                const shuffleBox = useGlobal
                    ? rootBoxAdapter.groove.box
                    : GrooveShuffleBox.create(boxGraph, UUID.generate(), box => {
                        box.label.setValue("Shuffle")
                        box.duration.setValue(480)
                    })
                return ZeitgeistDeviceBox.create(boxGraph, UUID.generate(), box => {
                    box.label.setValue("Zeitgeist")
                    box.groove.refer(shuffleBox)
                    box.index.setValue(index)
                    box.host.refer(unit)
                })
            }
        } satisfies Entry
    }

    export const AudioNamed = {
        StereoTool: {
            name: "Stereo Tool",
            description: "Computes a stereo transformation matrix with volume, panning, phase inversion and stereo width.",
            icon: IconSymbol.Stereo,
            separatorBefore: false,
            type: "audio",
            create: ({boxGraph}, unit, index) => StereoToolDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Stereo Tool")
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        Delay: {
            name: "Delay",
            description: "Echoes the input signal with time-based repeats",
            icon: IconSymbol.Time,
            separatorBefore: false,
            type: "audio",
            create: ({boxGraph}, unit, index) => DelayDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Delay")
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        Reverb: {
            name: "Reverb",
            description: "Simulates space and depth with reflections",
            icon: IconSymbol.Cube,
            separatorBefore: false,
            type: "audio",
            create: ({boxGraph}, unit, index) => ReverbDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Reverb")
                box.preDelay.setValue(0.001)
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        Revamp: {
            name: "Revamp",
            description: "Shapes the frequency balance of the sound",
            icon: IconSymbol.EQ,
            separatorBefore: false,
            type: "audio",
            create: ({boxGraph}, unit, index) => RevampDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue("Revamp")
                box.highPass.frequency.setValue(40.0)
                box.highPass.order.setValue(2)
                box.highPass.q.setValue(INVERSE_SQRT_2)
                box.highPass.enabled.setValue(true)
                box.lowShelf.frequency.setValue(80.0)
                box.lowShelf.gain.setValue(6)
                box.lowBell.frequency.setValue(120.0)
                box.lowBell.gain.setValue(6)
                box.lowBell.q.setValue(INVERSE_SQRT_2)
                box.midBell.frequency.setValue(640.0)
                box.midBell.q.setValue(INVERSE_SQRT_2)
                box.midBell.gain.setValue(6)
                box.highBell.frequency.setValue(3600.0)
                box.highBell.q.setValue(INVERSE_SQRT_2)
                box.highBell.gain.setValue(6)
                box.highShelf.frequency.setValue(10000.0)
                box.highShelf.gain.setValue(6)
                box.lowPass.frequency.setValue(15000.0)
                box.lowPass.order.setValue(2)
                box.lowPass.q.setValue(INVERSE_SQRT_2)
                box.index.setValue(index)
                box.host.refer(unit)
            })
        } satisfies Entry,
        Modular: {
            name: "🔇 Create New Modular Audio Effect (inaudible yet)",
            description: "",
            icon: IconSymbol.Box,
            separatorBefore: true,
            type: "audio",
            create: (project, unit, index) => {
                const graph = project.boxGraph
                const moduleSetupBox = ModularBox.create(graph, UUID.generate(), box => {
                    box.collection.refer(project.rootBox.modularSetups)
                    box.label.setValue("Modular")
                })
                const modularInput = ModularAudioInputBox.create(graph, UUID.generate(), box => {
                    box.attributes.collection.refer(moduleSetupBox.modules)
                    box.attributes.label.setValue("Modular Input")
                    box.attributes.x.setValue(-256)
                    box.attributes.y.setValue(32)
                })
                const modularOutput = ModularAudioOutputBox.create(graph, UUID.generate(), box => {
                    box.attributes.collection.refer(moduleSetupBox.modules)
                    box.attributes.label.setValue("Modular Output")
                    box.attributes.x.setValue(256)
                    box.attributes.y.setValue(32)
                })
                ModuleConnectionBox.create(graph, UUID.generate(), box => {
                    box.collection.refer(moduleSetupBox.connections)
                    box.source.refer(modularInput.output)
                    box.target.refer(modularOutput.input)
                })
                project.userEditingManager.modularSystem.edit(moduleSetupBox.editing)
                project.service.switchScreen("modular")
                return ModularDeviceBox.create(graph, UUID.generate(), box => {
                    box.label.setValue("Modular")
                    box.modularSetup.refer(moduleSetupBox.device)
                    box.index.setValue(index)
                    box.host.refer(unit)
                })
            }
        } satisfies Entry
    }

    export const MidiList: ReadonlyArray<Readonly<Entry>> = Object.values(MidiNamed)
    export const AudioList: ReadonlyArray<Readonly<Entry>> = Object.values(AudioNamed)
    export const MergedNamed = {...MidiNamed, ...AudioNamed}

    export type EffectKeys = keyof typeof MergedNamed
    export type MidiEffectKeys = keyof typeof MidiNamed
    export type AudioEffectKeys = keyof typeof AudioNamed
}