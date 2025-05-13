import {Messenger} from "runtime"
import {PeakWorker} from "fusion"
import {OpfsWorker} from "@/opfs/OpfsWorker"

const messenger: Messenger = Messenger.for(self)

OpfsWorker.init(messenger)
PeakWorker.install(messenger)