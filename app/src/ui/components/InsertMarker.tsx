import css from "./InsertMarker.sass?inline"
import { Html } from "dom"
import { IconSymbol } from "@/IconSymbol"
import { Icon } from "@/ui/components/Icon"
import { createElement } from "jsx"

const className = Html.adoptStyleSheet(css, "InsertMarker")

export const InsertMarker = () => {
	return (
		<div className={className}>
			<Icon symbol={IconSymbol.ArrayDown} />
		</div>
	)
}