'use client'

import { useState } from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function KubeconfigPaste({
  onConfigSubmit
}: {
  onConfigSubmit: (configText: string) => void;
}) {
  const [configText, setConfigText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div className="rounded-md bg-yellow-50 p-4 dark:bg-yellow-500/10">
        <div className="flex">
          <div className="shrink-0">
            <ExclamationTriangleIcon aria-hidden="true" className="size-5 text-yellow-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
              Kubernetes cluster unreachable
            </h3>
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>You can paste your kubeconfig to connect to your cluster.</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="rounded-md bg-yellow-100 px-2 py-1.5 text-sm font-medium text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-400/10 dark:text-yellow-400 dark:hover:bg-yellow-400/20"
              >
                Paste Kubeconfig
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onClose={() => setIsOpen(false)} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-500/75 transition-opacity data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:bg-gray-900/80"
      />

      <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all data-closed:translate-y-4 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-4xl sm:p-6 data-closed:sm:translate-y-0 data-closed:sm:scale-95 dark:bg-gray-800"
          >
            <div className="absolute top-0 right-0 hidden pt-4 pr-4 sm:block">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 dark:bg-gray-800 dark:text-gray-500 dark:hover:text-white"
              >
                <span className="sr-only">Close</span>
                <XMarkIcon aria-hidden="true" className="size-6" />
              </button>
            </div>

            <div className="sm:flex sm:items-start">
              <div className="mt-3 w-full text-center sm:mt-0 sm:text-left">
                <DialogTitle as="h3" className="text-xl font-semibold text-gray-900 dark:text-white">
                  Paste Kubeconfig
                </DialogTitle>
                <div className="mt-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Copy your kubeconfig from your cluster provider and paste below
                  </p>
                </div>

                <div className="mt-4">
                  <textarea
                    className="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10 dark:focus:ring-indigo-500 font-mono"
                    rows={12}
                    placeholder="Paste your full ~/.kube/config content here..."
                    value={configText}
                    onChange={(e) => setConfigText(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Format should be the full YAML config file content. Make sure to include clusters, contexts, and users.
                  </p>
                </div>

                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (configText.trim()) {
                        onConfigSubmit(configText);
                        setIsOpen(false);
                      }
                    }}
                    disabled={!configText.trim()}
                    className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 sm:col-start-2 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    Use This Config
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  );
}