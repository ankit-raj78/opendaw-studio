import {Messenger} from "runtime"
import {OpfsWorker, PeakWorker} from "fusion"

const messenger: Messenger = Messenger.for(self)

OpfsWorker.init(messenger)
PeakWorker.install(messenger)