import css from "./ErrorsPage.sass?inline"
import {Await, createElement, PageContext, PageFactory} from "jsx"
import {StudioService} from "@/service/StudioService.ts"
import {Html} from "dom"
import {ThreeDots} from "@/ui/spinner/ThreeDots.tsx"
import {ErrorLog} from "@/errors/ErrorHandler.ts"

const className = Html.adoptStyleSheet(css, "ErrorsPage")

export const ErrorsPage: PageFactory<StudioService> = ({service, path}: PageContext<StudioService>) => {
    return (
        <div className={className}>
            <Await factory={() => fetch(`https://logs.opendaw.studio/list.php`).then(x => x.json())}
                   failure={(error) => `Unknown request (${error.reason})`}
                   loading={() => <ThreeDots/>}
                   success={(json: ReadonlyArray<ErrorLog>) => json.map((log, index) => (
                           <div>
                               {`${index + 1}: ${Object.keys(log).join(", ")}`}
                           </div>
                       )
                   )}
            />
        </div>
    )
}