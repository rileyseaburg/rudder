# ⛵ Rudder

A fast, lightweight, and native GUI for managing Helm charts and Kubernetes.

**Rudder** is a simple, offline-first tool that solves the worst parts of Kubernetes management. No more "YAML hell" parsing 500-line `values.yaml` files. No more expensive, memory-hungry, cloud-first platforms.

It's the "GUI for `values.yaml`" you've always wanted.

-----

## The Problem

Managing Helm releases is a choice between two bad options:

1.  **"YAML Hell":** Manually editing complex `values.yaml` files, hoping you get the indentation right, and not really knowing what all the options are.
2.  **"Platform Rent-Seeking":** Using heavy, slow, Electron-based apps that demand a per-seat, per-month subscription to do things that should be simple.

`Rudder` is the third option. It's a "builder's tool"—fast, local, and free. It does 90% of what you need without the 90% of bloat.

## The Killer Feature: Schema-to-Form

`Rudder`'s core magic is its ability to automatically generate a clean, validated, easy-to-use form from your Helm chart's `values.schema.json` file.

  * **No More Guessing:** The app reads the schema and builds a UI with proper inputs, dropdowns for `enum` values, checkboxes for `boolean`s, and tooltips for descriptions.
  * **Guaranteed-Valid Config:** You can't enter a string where a number is required. You can't "hope" it's configured right. The form *is* the schema.
  * **Discoverable:** You can finally understand what a chart can *do* by seeing its options laid out in a clean UI.

-----

## Core Features

  * **Native & Fast:** Built with a Rust backend and a lightweight Svelte + Tailwind frontend via Tauri. It's tiny, uses minimal RAM, and starts instantly.
  * **Local-First:** `Rudder` is just a smart frontend for the `helm` and `kubectl` CLIs you already have. It reads your local Kube context. Your configs and keys never leave your machine.
  * **Release Dashboard:** On launch, see all releases deployed in your current cluster (`helm ls -A`).
  * **One-Click Actions:**
      * **Upgrade:** Visually edit your `values` on the auto-generated form and click "Upgrade."
      * **Rollback:** See a release's history (`helm history`) and roll back to a previous version with one click.
      * **Scale:** Quickly scale `Deployment` and `StatefulSet` replicas up or down without a full Helm upgrade.

-----

## Tech Stack

This project is an example of the "augmented expert" development model: using high-leverage tools to build a powerful app in record time.

  * **Backend:** **Rust**
      * Uses `tauri` for the app shell and native OS bridge.
      * Uses `std::process::Command` to run local `helm` and `kubectl` commands.
      * Handles reading `values.schema.json` files from disk.
  * **Frontend:** **TypeScript + Svelte**
      * The perfect, high-performance, "builder-friendly" framework.
  * **Styling:** **Tailwind CSS**
      * Utility-first styling for a lean, custom UI without "enterprisey" component kits.
  * **Key Libraries:**
      * **Headless UI:** For unstyled, accessible components (dropdowns, modals).
      * **`svelte-jsonschema-form`:** The engine for the "killer feature," allowing for a fully custom, Tailwind-styled theme for the generated form.

-----

## Getting Started

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/rileyseaburg/rudder.git
    cd rudder
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the app in development mode:**
    ```bash
    cargo tauri dev
    ```
