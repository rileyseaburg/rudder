'use client'

import { useState, useEffect, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react';
import {
  CheckIcon,
  ChevronUpDownIcon,
  ServerStackIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface ContextSwitcherProps {
  onContextChange?: (context: string) => void;
  className?: string;
}

interface ContextsData {
  contexts: string[];
  current: string;
}

export default function ContextSwitcher({ onContextChange, className = '' }: ContextSwitcherProps) {
  const [contexts, setContexts] = useState<string[]>([]);
  const [currentContext, setCurrentContext] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContexts();
  }, []);

  async function loadContexts() {
    try {
      setLoading(true);
      setError(null);

      const result = await invoke<string>('list_kube_contexts');
      const data: ContextsData = JSON.parse(result);
      
      setContexts(data.contexts);
      setCurrentContext(data.current);
    } catch (e) {
      setError(`Failed to load contexts: ${e}`);
      console.error('Failed to load contexts:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleContextChange(newContext: string) {
    if (newContext === currentContext || switching) return;

    try {
      setSwitching(true);
      setError(null);

      await invoke<string>('switch_kube_context', { contextName: newContext });
      setCurrentContext(newContext);
      
      // Notify parent component to refresh data
      onContextChange?.(newContext);
    } catch (e) {
      setError(`Failed to switch context: ${e}`);
      console.error('Failed to switch context:', e);
    } finally {
      setSwitching(false);
    }
  }

  // Extract cluster name from context (often format: user@cluster or arn:aws:eks:...)
  function getDisplayName(context: string): string {
    // Handle AWS EKS ARN format
    if (context.includes('arn:aws:eks')) {
      const parts = context.split('/');
      return parts[parts.length - 1] || context;
    }
    
    // Handle user@cluster format
    if (context.includes('@')) {
      return context.split('@')[1] || context;
    }
    
    // Handle gke_project_zone_cluster format
    if (context.startsWith('gke_')) {
      const parts = context.split('_');
      return parts[parts.length - 1] || context;
    }
    
    return context;
  }

  // Get provider icon/badge
  function getProviderBadge(context: string): { label: string; color: string } | null {
    if (context.includes('arn:aws:eks') || context.includes('eks')) {
      return { label: 'EKS', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' };
    }
    if (context.startsWith('gke_') || context.includes('gke')) {
      return { label: 'GKE', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' };
    }
    if (context.includes('aks') || context.includes('azure')) {
      return { label: 'AKS', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400' };
    }
    if (context.includes('minikube')) {
      return { label: 'Minikube', color: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' };
    }
    if (context.includes('kind') || context.includes('docker-desktop')) {
      return { label: 'Local', color: 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400' };
    }
    if (context.includes('k3s') || context.includes('k3d')) {
      return { label: 'K3s', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' };
    }
    return null;
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        <ArrowPathIcon className="h-4 w-4 animate-spin" />
        <span>Loading clusters...</span>
      </div>
    );
  }

  if (error && contexts.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-sm text-red-500 dark:text-red-400 ${className}`}>
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span>No clusters found</span>
        <button
          onClick={loadContexts}
          className="ml-2 text-indigo-500 hover:text-indigo-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Listbox value={currentContext} onChange={handleContextChange} disabled={switching}>
        <div className="relative">
          <ListboxButton className="relative w-full cursor-pointer rounded-lg bg-white py-2 pl-3 pr-10 text-left shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm dark:bg-gray-800 dark:ring-gray-700 dark:focus:ring-indigo-400">
            <span className="flex items-center gap-2">
              <ServerStackIcon className="h-4 w-4 text-gray-400" />
              <span className="block truncate text-gray-900 dark:text-white">
                {switching ? 'Switching...' : getDisplayName(currentContext) || 'Select cluster'}
              </span>
              {currentContext && getProviderBadge(currentContext) && (
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getProviderBadge(currentContext)!.color}`}>
                  {getProviderBadge(currentContext)!.label}
                </span>
              )}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              {switching ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin text-gray-400" />
              ) : (
                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
              )}
            </span>
          </ListboxButton>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm dark:bg-gray-800 dark:ring-white/10">
              {contexts.length === 0 ? (
                <div className="relative cursor-default select-none px-4 py-2 text-gray-500 dark:text-gray-400">
                  No contexts available
                </div>
              ) : (
                contexts.map((context) => (
                  <ListboxOption
                    key={context}
                    value={context}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active
                          ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-300'
                          : 'text-gray-900 dark:text-gray-100'
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <div className="flex items-center gap-2">
                          <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                            {getDisplayName(context)}
                          </span>
                          {getProviderBadge(context) && (
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getProviderBadge(context)!.color}`}>
                              {getProviderBadge(context)!.label}
                            </span>
                          )}
                        </div>
                        {context !== getDisplayName(context) && (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {context}
                          </span>
                        )}
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-600 dark:text-indigo-400">
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                ))
              )}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>

      {error && (
        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
