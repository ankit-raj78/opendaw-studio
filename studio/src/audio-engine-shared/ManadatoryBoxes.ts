import {AudioBusBox, AudioUnitBox, RootBox, TimelineBox, UserInterfaceBox} from "@/data/boxes"

export type MandatoryBoxes = {
    rootBox: RootBox
    timelineBox: TimelineBox
    masterBusBox: AudioBusBox
    masterAudioUnit: AudioUnitBox
    userInterfaceBox: UserInterfaceBox
}