/* ==========================================================
   Vision AI v2
========================================================== */

export type CameraEventType =

    | "camera-open"

    | "camera-close"

    | "camera-error"

    | "frame"

    | "capture"

    | "barcode"

    | "detector"

    | "counter"

    | "measure"

    | "ocr"

    | "scale"

    | "evidence";

export interface CameraEvent {

    type: CameraEventType;

    payload?: any;

}

export default class CameraEvents {

    private static listeners:

        ((event: CameraEvent) => void)[]

        = [];

    static subscribe(

        callback: (
            event: CameraEvent
        ) => void

    ) {

        this.listeners.push(callback);

    }

    static unsubscribe(

        callback: (
            event: CameraEvent
        ) => void

    ) {

        this.listeners =
            this.listeners.filter(
                listener =>
                    listener !== callback
            );

    }

    static emit(

        event: CameraEvent

    ) {

        this.listeners.forEach(

            callback => callback(event)

        );

    }

}
