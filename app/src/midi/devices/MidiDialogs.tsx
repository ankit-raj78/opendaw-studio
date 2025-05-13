import css from "./MidiDialogs.sass?inline"
import { Html } from "dom"
import { createElement } from "jsx"
import { Dialog, DialogHandler } from "@/ui/components/Dialog"
import { IconSymbol } from "@/IconSymbol"
import { Surface } from "@/ui/surface/Surface"
import { Exec } from "std"

const className = Html.adoptStyleSheet(css, "MidiDialogs")

export namespace MidiDialogs {
	export const showInfoDialog = (cancel: Exec): DialogHandler => {
		const dialog: HTMLDialogElement = (
			<Dialog headline={"Learn Midi Keys..."}
							icon={IconSymbol.DinSlot}
							cancelable={true}
							buttons={[{
								text: "Cancel",
								primary: false,
								onClick: handler => {
									handler.close()
									cancel()
								}
							}]}>
				<div style={{ padding: "1em 0" }}>
					<p>Hit a key on your midi-device to learn a connection.</p>
				</div>
			</Dialog>
		)
		Surface.get().body.appendChild(dialog)
		dialog.showModal()
		return dialog
	}
}