/* ==========================================================
   Vision AI v2
   CameraPermissions.ts
========================================================== */

export interface PermissionResult {

    granted: boolean;

    denied: boolean;

    error?: string;

}

export default class CameraPermissions {

    static async isSupported() {

        return !!(

            navigator.mediaDevices &&

            navigator.mediaDevices.getUserMedia

        );

    }

    static async request(): Promise<PermissionResult> {

        try {

            if (!(await this.isSupported())) {

                return {

                    granted: false,

                    denied: true,

                    error: "Navegador não suporta câmera."

                };

            }

            const stream =

                await navigator.mediaDevices.getUserMedia({

                    video: true,

                    audio: false

                });

            stream

                .getTracks()

                .forEach(track => track.stop());

            return {

                granted: true,

                denied: false

            };

        }

        catch (err: any) {

            return {

                granted: false,

                denied: true,

                error: err.message

            };

        }

    }

    static async check(): Promise<PermissionState | "unknown"> {

        try {

            if (!navigator.permissions)

                return "unknown";

            const permission =

                await navigator.permissions.query({

                    name: "camera" as PermissionName

                });

            return permission.state;

        }

        catch {

            return "unknown";

        }

    }

}
