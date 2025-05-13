import { Observer, Subscription } from "std"
import { Modifier } from "@/ui/timeline/Modifier.ts"

export interface ObservableModifier extends Modifier {
	subscribeUpdate(observer: Observer<void>): Subscription
}