import { panic } from "std"
import { createElement } from "jsx"
import { AudioUnitBox } from "@/data/boxes"
import { MenuButton } from "@/ui/components/MenuButton.tsx"
import { MenuItem } from "@/ui/model/menu-item"
import { Effects } from "@/service/Effects.ts"
import { Colors } from "@/ui/Colors.ts"
import { Project } from "@/project/Project.ts"
import css from "./DropPlaceholder.sass?inline"
import { Html } from "dom"

const className = Html.adoptStyleSheet(css, "drop-placeholder")

type Construct = {
	project: Project
	channelStrip: AudioUnitBox
}

export const DropPlaceholder = ({ project, channelStrip }: Construct) => <div
	className={className}>
	<MenuButton root={MenuItem.root()
		.setRuntimeChildrenProcedure(parent => parent
			.addMenuItem(...Effects.AudioList.map(entry => MenuItem.default({
				label: entry.name,
				separatorBefore: entry.separatorBefore
			}).setTriggerProcedure(() => panic("Not implemented")))))}
							appearance={{ color: Colors.shadow, activeColor: Colors.gray, tinyTriangle: true }}>
		add effect
	</MenuButton>
</div>