/* ==========================================================
   Vision AI v2
   CameraCapture.ts
========================================================== */

export default class CameraCapture {

    static capture(
        video: HTMLVideoElement,
        quality = 0.95
    ): string {

        const canvas =
            document.createElement("canvas");

        canvas.width = video.videoWidth;

        canvas.height = video.videoHeight;

        const ctx =
            canvas.getContext("2d");

        if (!ctx)
            throw new Error("Canvas indisponível");

        ctx.drawImage(
            video,
            0,
            0,
            canvas.width,
            canvas.height
        );

        return canvas.toDataURL(
            "image/jpeg",
            quality
        );

    }

}
