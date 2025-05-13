import { int } from "std"

export interface Event<TYPE> {
	readonly ticks: int
	readonly type: TYPE
}