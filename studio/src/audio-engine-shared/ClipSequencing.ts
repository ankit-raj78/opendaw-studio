import {Terminable, UUID} from "std"
import {ppqn} from "dsp"
import {Section} from "@/worklet/ClipSequencingAudioContext"

export interface ClipSequencing extends Terminable {
    iterate(trackKey: UUID.Format, a: ppqn, b: ppqn): Generator<Section>
}