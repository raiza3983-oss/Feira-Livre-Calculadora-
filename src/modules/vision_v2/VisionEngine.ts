/* ==========================================================
   Vision AI v2
   VisionEngine.ts
========================================================== */

import {
    VisionConfiguration,
    VisionResult,
    VisionStatus
} from "./VisionTypes";

type Listener = (result: VisionResult) => void;

export class VisionEngine {

    private status: VisionStatus = "idle";

    private configuration: VisionConfiguration;

    private listeners: Listener[] = [];

    constructor(config: VisionConfiguration) {

        this.configuration = config;

    }

    /* ================================
       Estado
    ================================= */

    getStatus() {

        return this.status;

    }

    getConfiguration() {

        return this.configuration;

    }

    setConfiguration(
        config: Partial<VisionConfiguration>
    ) {

        this.configuration = {

            ...this.configuration,

            ...config

        };

    }

    /* ================================
       Controle
    ================================= */

    start() {

        this.status = "starting";

        console.log("Vision Engine iniciado");

        this.status = "running";

    }

    stop() {

        this.status = "stopped";

        console.log("Vision Engine parado");

    }

    pause() {

        this.status = "paused";

    }

    resume() {

        this.status = "running";

    }

    /* ================================
       Eventos
    ================================= */

    subscribe(listener: Listener) {

        this.listeners.push(listener);

    }

    unsubscribe(listener: Listener) {

        this.listeners =
            this.listeners.filter(
                item => item !== listener
            );

    }

    emit(result: VisionResult) {

        this.listeners.forEach(listener => {

            listener(result);

        });

    }

    /* ================================
       Métodos futuros
    ================================= */

    detectObject() {

        console.log("Detector");

    }

    readBarcode() {

        console.log("Código de barras");

    }

    readOCR() {

        console.log("OCR");

    }

    countObjects() {

        console.log("Contador");

    }

    measureObject() {

        console.log("Medidor");

    }

    readScale() {

        console.log("Balança");

    }

    saveEvidence() {

        console.log("Salvar evidência");

    }

}
