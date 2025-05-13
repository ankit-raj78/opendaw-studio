import { Fonts } from "@/ui/Fonts"
import { loadFont } from "dom"
import { Lazy } from "std"

export class FontLoader {
	@Lazy
	static async load() {
		return Promise.allSettled([
			loadFont(Fonts.Rubik), loadFont(Fonts.OpenSans)
		])
	}
}