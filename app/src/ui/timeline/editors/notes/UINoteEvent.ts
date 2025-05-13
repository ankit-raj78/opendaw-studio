import { NoteEvent, ppqn } from "dsp"
import { int } from "std"

export type UINoteEvent = NoteEvent & {
	isSelected: boolean
	complete: ppqn
	chance: number
	playCount: int
	playCurve: number
}