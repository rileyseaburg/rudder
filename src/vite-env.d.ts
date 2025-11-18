/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api" />
declare global {
	interface Window {
		/** Tauri injected runtime object (optional) */
		__TAURI__?: unknown;
	}
}

export {};
