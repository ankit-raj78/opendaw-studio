import { ContextMenu } from "@/ui/ContextMenu.ts"
import { MenuItem } from "@/ui/model/menu-item.ts"
import { TrackType } from "@/audio-engine-shared/adapters/timeline/TrackType.ts"
import { Editing, PrimitiveField, PrimitiveValues } from "box"
import { AudioUnitTracks } from "@/audio-engine-shared/adapters/audio-unit/AudioUnitTracks.ts"
import { Pointers } from "@/data/pointers.ts"
import { MidiDevices } from "@/midi/devices/MidiDevices"

export const attachParameterContextMenu = <T extends PrimitiveValues>(editing: Editing,
																																			midiDevices: MidiDevices,
																																			tracks: AudioUnitTracks,
																																			field: PrimitiveField<T, Pointers.Automation | Pointers.MidiControl>,
																																			element: Element) =>
	ContextMenu.subscribe(element, collector => {
		const automation = tracks.controls(field)
		collector.addItems(
			automation.isEmpty()
				? MenuItem.default({ label: "Create Automation" })
					.setTriggerProcedure(() => editing.modify(() =>
						tracks.create(TrackType.Value, field)))
				: MenuItem.default({ label: "Remove Automation" })
					.setTriggerProcedure(() => editing.modify(() =>
						tracks.delete(automation.unwrap()))),
			MenuItem.default({
				label: midiDevices.hasMidiConnection(field.address)
					? "Forget Midi"
					: "Learn Midi Control..."
			}).setTriggerProcedure(() => {
				if (midiDevices.hasMidiConnection(field.address)) {
					midiDevices.forgetMidiConnection(field.address)
				} else {
					midiDevices.learnMidiControls(field)
				}
			}),
			MenuItem.default({ label: "Reset Value", checked: field.getValue() === field.initValue })
				.setTriggerProcedure(() => editing.modify(() => field.reset()))
		)
	})