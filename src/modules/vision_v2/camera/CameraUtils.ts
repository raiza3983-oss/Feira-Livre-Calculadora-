/* ==========================================================
   Vision AI v2
========================================================== */

export default class CameraUtils {

    static isMobile() {

        return /Android|iPhone|iPad|iPod/i
            .test(
                navigator.userAgent
            );

    }

    static isSecureContext() {

        return window.isSecureContext;

    }

    static supportsCamera() {

        return !!(

            navigator.mediaDevices &&

            navigator.mediaDevices.getUserMedia

        );

    }

}
